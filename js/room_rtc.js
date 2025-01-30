let uid = Number(sessionStorage.getItem('uid')) || Math.floor(Math.random() * 4294967295) + 1;
let uidString = String(uid);
const channelName = 'main'; // Pode ser alterado conforme necessário

let client;
let rtmClient;
let channel;
let AppID = '71104d47e7ae4b11828a52a67f0c34f7';
let localTrack = [];
let remoteUsers = {};
let localScreenTracks;
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
            body: JSON.stringify({uid: String(uid)}), // Converte para string antes de enviar
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

    // Iniciar a transmissão local
    joinStream();
};

let joinStream = async () => {
    try {
        localTrack = await AgoraRTC.createMicrophoneAndCameraTracks({}, {
            encoderConfig: {
                width: {min: 640, ideal: 1920, max: 1920},
                height: {min: 480, ideal: 1080, max: 1080}
            }
        });

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
};

let switchToCamera = async () => {
    let player = `<div class="video_container" id="user-container-${uid}">
                            <div class="video-player" id="user-${uid}"></div>
                        </div>`;

    displayFrame.insertAdjacentHTML('beforeend', player);

    await localTrack[0].setMuted(true);
    await localTrack[1].setMuted(true);

    document.getElementById('mic-btn').classList.remove('active');
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
    document.getElementById(`user-container-${user.uid}`).remove();

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
        button.classList.add('active');
    } else {
        await localTrack[0].setMuted(true);
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

    if (!sharingScreen) {
        sharingScreen = true;

        screenButton.classList.add('active');
        cameraButton.classList.remove('active');
        cameraButton.style.display = 'none';

        localScreenTracks = await AgoraRTC.createScreenVideoTrack();

        document.getElementById(`user-container-${uid}`).remove();
        displayFrame.style.display = 'block';

        let player = `<div class="video_container" id="user-container-${user.uid}">
                                <div class="video-player" id="user-${user.uid}"></div>
                            </div>`;

        displayFrame.insertAdjacentHTML('beforeend', player);
        document.getElementById(`user-container-${uid}`).addEventListener('click', expandVideoFrame);

        userIDInDisplayFrame = `user-container-${uid}`;
        localScreenTracks.play(`user-${uid}`);

        await client.unpublish([localTrack[1]]);
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

        switchToCamera();
    }
}

document.getElementById('camera-btn').addEventListener('click', toggleCamera);
document.getElementById('mic-btn').addEventListener('click', toggleMic);
document.getElementById('screen-btn').addEventListener('click', toggleScreen);

joinRoomInit();
