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

    const allQuests = [...QuestsStore.quests.values()];
    const activeQuests = allQuests.filter(x =>
        x?.id !== "1248385850622869556" &&
        x.userStatus?.enrolledAt &&
        !x.userStatus?.completedAt &&
        new Date(x?.config?.expiresAt).getTime() > Date.now()
    );

    if (activeQuests.length === 0) {
        console.log("No available uncompleted quests found, Mowa!");
        return;
    }

    // Interactive menu
    const taskTypes = ["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY"];
    const enabledTasks = [];

    console.clear();
    console.log("========= Select Tasks to Spoof =========");
    taskTypes.forEach((task, i) => {
        const checked = confirm(`Enable spoofing for ${task.replaceAll("_", " ")}?`);
        if (checked) enabledTasks.push(task);
    });
    console.log("=========================================");

    for (const quest of activeQuests) {
        const pid = Math.floor(Math.random() * 30000) + 1000;

        const applicationId = quest.config?.application?.id;
        const applicationName = quest.config?.application?.name;
        const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
        const taskName = taskTypes.find(x => taskConfig.tasks[x] != null);

        if (!enabledTasks.includes(taskName)) {
            console.log(`Skipping quest: ${applicationName} - ${taskName}`);
            continue;
        }

        const secondsNeeded = taskConfig.tasks[taskName].target;
        let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;
        const isApp = typeof DiscordNative !== "undefined";

        if (taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
            const maxFuture = 10, speed = 7, interval = 1;
            const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();

            let fn = async () => {
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
                    await new Promise(resolve => setTimeout(resolve, interval * 1000));
                }
                console.log(`✅ Completed video quest for ${applicationName}`);
            };
            fn();
            console.log(`▶️ Spoofing video: ${applicationName}`);

        } else if (taskName === "PLAY_ON_DESKTOP") {
            if (!isApp) {
                console.log(`⚠️ Use the desktop app for ${applicationName}`);
                continue;
            }
            api.get({ url: `/applications/public?application_ids=${applicationId}` }).then(res => {
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
                const fakeGames = [fakeGame];
                const realGetRunningGames = RunningGameStore.getRunningGames;
                const realGetGameForPID = RunningGameStore.getGameForPID;
                RunningGameStore.getRunningGames = () => fakeGames;
                RunningGameStore.getGameForPID = pid => fakeGames.find(x => x.pid === pid);
                FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: realGames, added: [fakeGame], games: fakeGames });

                const fn = data => {
                    let progress = quest.config.configVersion === 1
                        ? data.userStatus.streamProgressSeconds
                        : Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);
                    console.log(`Quest progress: ${progress}/${secondsNeeded}`);
                    if (progress >= secondsNeeded) {
                        console.log(`✅ Completed desktop quest: ${applicationName}`);
                        RunningGameStore.getRunningGames = realGetRunningGames;
                        RunningGameStore.getGameForPID = realGetGameForPID;
                        FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] });
                        FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
                    }
                };
                FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
                console.log(`▶️ Spoofing game: ${applicationName}`);
            });

        } else if (taskName === "STREAM_ON_DESKTOP") {
            if (!isApp) {
                console.log(`⚠️ Use the desktop app for ${applicationName}`);
                continue;
            }

            const realFunc = ApplicationStreamingStore.getStreamerActiveStreamMetadata;
            ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({
                id: applicationId,
                pid,
                sourceName: null
            });

            const fn = data => {
                const progress = quest.config.configVersion === 1
                    ? data.userStatus.streamProgressSeconds
                    : Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);
                console.log(`Quest progress: ${progress}/${secondsNeeded}`);
                if (progress >= secondsNeeded) {
                    console.log(`✅ Completed stream quest: ${applicationName}`);
                    ApplicationStreamingStore.getStreamerActiveStreamMetadata = realFunc;
                    FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
                }
            };
            FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
            console.log(`▶️ Spoofing stream: ${applicationName}`);

        } else if (taskName === "PLAY_ACTIVITY") {
            const channelId = ChannelStore.getSortedPrivateChannels()[0]?.id ??
                Object.values(GuildChannelStore.getAllGuilds()).find(x => x?.VOCAL?.length > 0)?.VOCAL[0]?.channel?.id;
            const streamKey = `call:${channelId}:1`;

            let fn = async () => {
                console.log(`▶️ Spoofing activity: ${applicationName}`);
                while (true) {
                    const res = await api.post({
                        url: `/quests/${quest.id}/heartbeat`,
                        body: { stream_key: streamKey, terminal: false }
                    });
                    const progress = res.body.progress.PLAY_ACTIVITY.value;
                    console.log(`Quest progress: ${progress}/${secondsNeeded}`);
                    await new Promise(resolve => setTimeout(resolve, 20 * 1000));
                    if (progress >= secondsNeeded) {
                        await api.post({
                            url: `/quests/${quest.id}/heartbeat`,
                            body: { stream_key: streamKey, terminal: true }
                        });
                        break;
                    }
                }
                console.log(`✅ Completed activity quest: ${applicationName}`);
            };
            fn();
        }
    }
})();
