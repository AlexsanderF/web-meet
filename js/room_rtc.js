let uid = Number(sessionStorage.getItem('uid')) || Math.floor(Math.random() * 4294967295) + 1;
let uidString = String(uid);
const channelName = 'main';

let client;
let rtmClient;
let channel;
let localScreenTracks;
let AppID = '71104d47e7ae4b11828a52a67f0c34f7';
let localTrack = [];
let remoteUsers = {};
let wasMicMuted = true;
let sharingScreen = false;
let displayName = sessionStorage.getItem('display_name');

if (!displayName) {
    window.location = 'lobby.html';
}

// Funções para buscar os tokens da API
const fetchAgoraTokenRtc = async (channelName, uid) => {
    try {
        const response = await fetch('http://127.0.0.1/api/generate-token-rtc', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({channelName, uid}),
        });

        const data = await response.json();
        return data.token;
    } catch (error) {
        console.error('Erro ao buscar token:', error);
        throw error;
    }
};

const fetchAgoraTokenRtm = async (uid) => {
    try {
        const response = await fetch('http://127.0.0.1/api/generate-token-rtm', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({uid: String(uid)}),
        });

        const data = await response.json();
        return data.token;
    } catch (error) {
        console.error('Erro ao buscar token:', error);
        throw error;
    }
};

// Sanitizar o ID da sala
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);

const sanitizeRoomId = (roomId) => {
    const validCharsRegex = /^[a-zA-Z0-9 !#$%&()+\-:;<=>?@[\\\]^_{|}~,.]{1,64}$/;
    if (!roomId || !validCharsRegex.test(roomId)) {
        return 'main'; // Valor padrão
    }
    return roomId;
};

let roomId = sanitizeRoomId(urlParams.get('room') || channelName);

let joinRoomInit = async () => {
    // Buscar os tokens da API
    const tokenRtc = await fetchAgoraTokenRtc(roomId, uid);
    const tokenRtm = await fetchAgoraTokenRtm(uidString);

    rtmClient = await AgoraRTM.createInstance(AppID);
    await rtmClient.login({"uid": uidString, "token": tokenRtm});
    await rtmClient.addOrUpdateLocalUserAttributes({'name': displayName});

    channel = await rtmClient.createChannel(roomId);
    await channel.join()

    channel.on('MemberJoined', handleMemberJoined);
    channel.on('MemberLeft', handleMemberLeft);
    channel.on('ChannelMessage', handleChannelMessage);

    getMembers();
    addBotMessageToDom(`Welcome to the room, ${displayName}! 👋`);

    console.log('Generated Token RTC:', tokenRtc);
    console.log('Generated Token RTM:', tokenRtm);
    console.log('Room ID:', roomId);
    console.log('UID RTC:', uid);
    console.log('UID RTM', uidString);

    // Ingressar na sala com o token gerado
    client = AgoraRTC.createClient({mode: 'rtc', codec: 'vp8'});
    await client.join(AppID, roomId, tokenRtc, uid);
    console.log('Joined room successfully:', roomId);

    client.on('user-published', handleUserPublished);
    client.on('user-left', handleUserLeft);
    client.on("network-quality", (stats) => {
        let localQuality = stats.uplinkNetworkQuality;
        let remoteQuality = stats.downlinkNetworkQuality;

        //console.log(`Qualidade da Rede - Upload: ${localQuality}, Download: ${remoteQuality}`);
        updateNetworkIndicator(localQuality, remoteQuality, uid);
    });
};

let joinStream = async () => {
    document.getElementById('join-btn').style.display = 'none';
    document.getElementsByClassName('stream__actions')[0].style.display = 'flex';

    try {
        localTrack = await AgoraRTC.createMicrophoneAndCameraTracks({}, {
            encoderConfig: {
                width: {min: 640, ideal: 1920, max: 1920},
                height: {min: 480, ideal: 1080, max: 1080}
            }
        });

        await localTrack[0].setMuted(wasMicMuted);

        document.getElementById('camera-btn').classList.add('active');

        let player = `<div class="video_container" id="user-container-${uid}">
                                <div class="video-player" id="user-${uid}"></div>
                            </div>`;

        document.getElementById('streams__container').insertAdjacentHTML('beforeend', player);
        document.getElementById(`user-container-${uid}`).addEventListener('click', expandVideoFrame);

        localTrack[1].play(`user-${uid}`);
        await client.publish([localTrack[0], localTrack[1]]);
    } catch (error) {
        console.error('Erro ao iniciar o stream:', error);
    }
    initVolumeIndicator();
};

let switchToCamera = async () => {
    let player = `<div class="video_container" id="user-container-${uid}">
                            <div class="video-player" id="user-${uid}"></div>
                        </div>`;

    displayFrame.insertAdjacentHTML('beforeend', player);

    if (!wasMicMuted) {
        await localTrack[0].setMuted(false);
        document.getElementById('mic-btn').classList.add('active');
    } else {
        await localTrack[0].setMuted(true);
        document.getElementById('mic-btn').classList.remove('active');
    }

    await localTrack[1].setMuted(false);

    document.getElementById('screen-btn').classList.remove('active');

    localTrack[1].play(`user-${uid}`);
    await client.publish([localTrack[1]]);
}

let handleUserPublished = async (user, mediaType) => {
    remoteUsers[user.uid] = user;

    await client.subscribe(user, mediaType);

    let player = document.getElementById(`user-container-${user.uid}`);

    if (player === null) {
        player = `<div class="video_container" id="user-container-${user.uid}">
                    <div class="video-player" id="user-${user.uid}"></div>
                  </div>`;
        document.getElementById('streams__container').insertAdjacentHTML('beforeend', player);
        document.getElementById(`user-container-${user.uid}`).addEventListener('click', expandVideoFrame);
    }

    if (displayFrame.style.display) {
        let videoFrame = document.getElementById(`user-container-${user.uid}`);
        videoFrame.style.height = '100px';
        videoFrame.style.width = '100px';
    }

    if (mediaType === 'video') {
        user.videoTrack.play(`user-${user.uid}`);
    }

    if (mediaType === 'audio') {
        user.audioTrack.play();
    }
};

let handleUserLeft = async (user) => {
    delete remoteUsers[user.uid];
    let item = document.getElementById(`user-container-${user.uid}`);

    if (item) {
        item.remove();
    }

    if (userIDInDisplayFrame === `user-container-${user.uid}`) {
        displayFrame.style.display = null;

        let videoFrame = document.getElementsByClassName('video_container');

        for (let i = 0; videoFrame.length > i; i++) {
            videoFrame[i].style.height = '300px';
            videoFrame[i].style.width = '300px';
        }
    }
};

let toggleMic = async (e) => {
    let button = e.currentTarget;

    if (localTrack[0].muted) {
        await localTrack[0].setMuted(false);
        wasMicMuted = false;
        button.classList.add('active');
    } else {
        await localTrack[0].setMuted(true);
        wasMicMuted = true;
        button.classList.remove('active');
    }
};

let toggleCamera = async (e) => {
    let button = e.currentTarget;

    if (localTrack[1].muted) {
        await localTrack[1].setMuted(false);
        button.classList.add('active');
    } else {
        await localTrack[1].setMuted(true);
        button.classList.remove('active');
    }
};

let toggleScreen = async (e) => {
    let screenButton = e.currentTarget;
    let cameraButton = document.getElementById('camera-btn');
    let micButton = document.getElementById('mic-btn');

    if (!sharingScreen) {
        sharingScreen = true;

        screenButton.classList.add('active');
        cameraButton.style.display = 'none';

        if (!wasMicMuted) {
            await localTrack[0].setMuted(false);
            micButton.classList.add('active');
        } else {
            await localTrack[0].setMuted(true);
            micButton.classList.remove('active');
        }

        localScreenTracks = await AgoraRTC.createScreenVideoTrack();

        document.getElementById(`user-container-${uid}`).remove();
        displayFrame.style.display = 'block';

        let player = `<div class="video_container" id="user-container-${uid}">
                                <div class="video-player" id="user-${uid}"></div>
                            </div>`;

        displayFrame.insertAdjacentHTML('beforeend', player);
        document.getElementById(`user-container-${uid}`).addEventListener('click', expandVideoFrame);

        userIDInDisplayFrame = `user-container-${uid}`;
        localScreenTracks.play(`user-${uid}`);

        await client.unpublish([localTrack[1]]);
        await client.publish([localTrack[0]]);

        await client.publish([localScreenTracks]);

        let videoFrames = document.getElementsByClassName('video_container');
        for (let i = 0; videoFrames.length > i; i++) {
            if (videoFrames[i].id !== userIDInDisplayFrame) {
                videoFrames[i].style.height = '100px';
                videoFrames[i].style.width = '100px';
            }
        }

    } else {
        sharingScreen = false;
        cameraButton.style.display = 'block';

        document.getElementById(`user-container-${uid}`).remove();
        await client.unpublish([localScreenTracks]);

        await switchToCamera();
    }
}

let leaveStream = async (e) => {
    e.preventDefault();

    document.getElementById('join-btn').style.display = 'block';
    document.getElementsByClassName('stream__actions')[0].style.display = 'none';

    for (let i = 0; localTrack.length > i; i++) {
        localTrack[i].stop();
        localTrack[i].close();
    }

    await client.unpublish([localTrack[0], localTrack[1]]);

    if (localScreenTracks) {
        await client.unpublish([localScreenTracks]);
    }

    document.getElementById(`user-container-${uid}`).remove();

    if (userIDInDisplayFrame === `user-container-${uid}`) {
        displayFrame.style.display = null;

        for (let i = 0; videoFrames.length > i; i++) {
            videoFrames[i].style.height = '300px';
            videoFrames[i].style.width = '300px';
        }
    }

    channel.sendMessage({text: JSON.stringify({'type': 'user_left', 'uid': uid})});
}

let initVolumeIndicator = () => {
    AgoraRTC.setParameter('AUDIO_VOLUME_INDICATION_INTERVAL', 200);
    client.enableAudioVolumeIndicator();

    client.on('volume-indicator', volumes => {
        //console.log('Volumes', volumes);
        volumes.forEach(volume => {
            console.log('VOLUME:', volume.level, 'UID:', volume.uid);

            let item = document.getElementById(`user-container-${volume.uid}`);

            if (volume.level >= 50) {
                item.style.borderColor = "#00ff00";
            } else {
                item.style.borderColor = "#b366f9"
            }
        });
    });
};

document.getElementById('camera-btn').addEventListener('click', toggleCamera);
document.getElementById('mic-btn').addEventListener('click', toggleMic);
document.getElementById('screen-btn').addEventListener('click', toggleScreen);
document.getElementById('leave-btn').addEventListener('click', leaveStream);
document.getElementById('join-btn').addEventListener('click', joinStream);

joinRoomInit();
