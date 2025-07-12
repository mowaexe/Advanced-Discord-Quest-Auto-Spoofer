(async () => {
    delete window.$;
    let wpRequire = webpackChunkdiscord_app.push([[Symbol()], {}, r => r]);
    webpackChunkdiscord_app.pop();

    const getModule = (check) => Object.values(wpRequire.c).find(check)?.exports;

    const ApplicationStreamingStore = getModule(x => x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata)?.Z;
    const RunningGameStore = getModule(x => x?.exports?.ZP?.getRunningGames)?.ZP;
    const QuestsStore = getModule(x => x?.exports?.Z?.__proto__?.getQuest)?.Z;
    const ChannelStore = getModule(x => x?.exports?.Z?.__proto__?.getAllThreadsForParent)?.Z;
    const GuildChannelStore = getModule(x => x?.exports?.ZP?.getSFWDefaultChannel)?.ZP;
    const FluxDispatcher = getModule(x => x?.exports?.Z?.__proto__?.flushWaitQueue)?.Z;
    const api = getModule(x => x?.exports?.tn?.get)?.tn;

    // 🔄 Per-quest timer management
    const activeTimers = {};
    const createQuestTimer = (questId, label, seconds) => {
        const box = document.createElement("div");
        box.id = `quest-timer-${questId}`;
        Object.assign(box.style, {
            position: "fixed",
            top: `${30 + Object.keys(activeTimers).length * 60}px`,
            left: "10px",
            background: "#2f3136",
            color: "#fff",
            padding: "6px 12px",
            borderRadius: "10px",
            fontSize: "14px",
            fontWeight: "bold",
            zIndex: 9999,
            boxShadow: "0 0 10px rgba(0,0,0,0.4)",
            cursor: "move",
            userSelect: "none",
            minWidth: "140px",
        });
        box.innerText = `⏳ ${label}: ${seconds}s`;
        document.body.appendChild(box);
        activeTimers[questId] = { box, remaining: seconds };

        let dragging = false, offsetX = 0, offsetY = 0;
        box.addEventListener("mousedown", (e) => {
            dragging = true;
            offsetX = e.clientX - box.offsetLeft;
            offsetY = e.clientY - box.offsetTop;
        });
        document.addEventListener("mouseup", () => dragging = false);
        document.addEventListener("mousemove", (e) => {
            if (dragging) {
                box.style.left = `${e.clientX - offsetX}px`;
                box.style.top = `${e.clientY - offsetY}px`;
            }
        });

        const interval = setInterval(() => {
            if (!activeTimers[questId]) return clearInterval(interval);
            activeTimers[questId].remaining--;
            if (activeTimers[questId].remaining <= 0) {
                box.innerText = `✅ ${label} done`;
                clearInterval(interval);
                setTimeout(() => box.remove(), 3000);
                delete activeTimers[questId];
            } else {
                box.innerText = `⏳ ${label}: ${activeTimers[questId].remaining}s`;
            }
        }, 1000);
    };

    const allQuests = [...QuestsStore.quests.values()];
    const activeQuests = allQuests.filter(q =>
        q?.id !== "1248385850622869556" &&
        q.userStatus?.enrolledAt &&
        !q.userStatus?.completedAt &&
        new Date(q?.config?.expiresAt).getTime() > Date.now()
    );

    if (activeQuests.length === 0) {
        console.log("No available uncompleted quests found.");
        return;
    }

    const taskTypes = ["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY"];
    const enabledTasks = [];

    console.clear();
    console.log("========= Select Tasks to Spoof =========");
    for (const task of taskTypes) {
        if (confirm(`Enable spoofing for ${task.replaceAll("_", " ")}?`)) {
            enabledTasks.push(task);
        }
    }
    console.log("=========================================");

    for (const quest of activeQuests) {
        const applicationId = quest.config?.application?.id;
        const applicationName = quest.config?.application?.name;
        const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
        const taskName = taskTypes.find(t => taskConfig.tasks[t]);

        if (!enabledTasks.includes(taskName)) {
            console.log(`Skipping: ${applicationName} (${taskName})`);
            continue;
        }

        const secondsNeeded = taskConfig.tasks[taskName].target;
        let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;
        const isApp = typeof DiscordNative !== "undefined";
        const pid = Math.floor(Math.random() * 30000) + 1000;

        createQuestTimer(quest.id, applicationName, secondsNeeded - secondsDone);

        if (["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE"].includes(taskName)) {
            const maxFuture = 10, speed = 7, interval = 1;
            const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
            (async () => {
                while (true) {
                    const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
                    const diff = maxAllowed - secondsDone;
                    const timestamp = secondsDone + speed;
                    if (diff >= speed) {
                        await api.post({
                            url: `/quests/${quest.id}/video-progress`,
                            body: { timestamp: Math.min(secondsNeeded, timestamp + Math.random()) }
                        });
                        secondsDone = Math.min(secondsNeeded, timestamp);
                    }
                    if (timestamp >= secondsNeeded) break;
                    await new Promise(r => setTimeout(r, interval * 1000));
                }
                console.log(`✅ Completed video quest: ${applicationName}`);
            })();

        } else if (taskName === "PLAY_ON_DESKTOP") {
            if (!isApp) {
                console.log(`⚠️ Use the desktop app for ${applicationName}`);
                continue;
            }
            const res = await api.get({ url: `/applications/public?application_ids=${applicationId}` });
            const appData = res.body[0];
            const exeName = appData.executables.find(x => x.os === "win32").name.replace(">", "");
            const fakeGame = {
                cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
                exeName,
                exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
                hidden: false,
                isLauncher: false,
                id: applicationId,
                name: appData.name,
                pid: pid,
                pidPath: [pid],
                processName: appData.name,
                start: Date.now(),
            };

            const realGames = RunningGameStore.getRunningGames();
            const realGetRunningGames = RunningGameStore.getRunningGames;
            const realGetGameForPID = RunningGameStore.getGameForPID;

            RunningGameStore.getRunningGames = () => [fakeGame];
            RunningGameStore.getGameForPID = pid => [fakeGame].find(g => g.pid === pid);
            FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: realGames, added: [fakeGame], games: [fakeGame] });

            const fn = data => {
                const progress = Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);
                if (progress >= secondsNeeded) {
                    console.log(`✅ Completed: ${applicationName}`);
                    RunningGameStore.getRunningGames = realGetRunningGames;
                    RunningGameStore.getGameForPID = realGetGameForPID;
                    FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] });
                    FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
                }
            };
            FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);

        } else if (taskName === "STREAM_ON_DESKTOP") {
            if (!isApp) {
                console.log(`⚠️ Use the desktop app for ${applicationName}`);
                continue;
            }
            const realFunc = ApplicationStreamingStore.getStreamerActiveStreamMetadata;
            ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({ id: applicationId, pid, sourceName: null });

            const fn = data => {
                const progress = Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);
                if (progress >= secondsNeeded) {
                    console.log(`✅ Completed: ${applicationName}`);
                    ApplicationStreamingStore.getStreamerActiveStreamMetadata = realFunc;
                    FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
                }
            };
            FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);

        } else if (taskName === "PLAY_ACTIVITY") {
            const channelId = ChannelStore.getSortedPrivateChannels()[0]?.id ??
                Object.values(GuildChannelStore.getAllGuilds()).find(x => x?.VOCAL?.length > 0)?.VOCAL[0]?.channel?.id;
            const streamKey = `call:${channelId}:1`;

            (async () => {
                console.log(`▶️ Spoofing activity: ${applicationName}`);
                while (true) {
                    const res = await api.post({
                        url: `/quests/${quest.id}/heartbeat`,
                        body: { stream_key: streamKey, terminal: false }
                    });
                    const progress = res.body.progress.PLAY_ACTIVITY.value;
                    if (progress >= secondsNeeded) {
                        await api.post({
                            url: `/quests/${quest.id}/heartbeat`,
                            body: { stream_key: streamKey, terminal: true }
                        });
                        break;
                    }
                    await new Promise(r => setTimeout(r, 20000));
                }
                console.log(`✅ Completed activity quest: ${applicationName}`);
            })();
        }
    }
})();
