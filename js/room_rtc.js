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
    window.location = 'index.html';
}

// Funções para buscar os tokens da API
const fetchAgoraTokenRtc = async (channelName, uid) => {
    try {
        const response = await fetch('https://apiservice.infatec.solutions/api/generate-token-rtc', {
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
        const response = await fetch('https://apiservice.infatec.solutions/api/generate-token-rtm', {
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
        return 'main';
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
    channel.on('ChannelMessage', (message, memberId) => {
        try {
            let data = JSON.parse(message.text);
            if (data.type === 'cameraOn') {
                let avatarElem = document.getElementById(`user-avatar-${data.uid}`);
                if (avatarElem) {
                    avatarElem.style.display = "none";
                }
            } else if (data.type === 'cameraOff') {
                let avatarElem = document.getElementById(`user-avatar-${data.uid}`);
                if (avatarElem) {
                    avatarElem.style.display = "block";
                }
            }
        } catch (error) {
            console.error("Erro ao processar a mensagem do canal:", error);
        }
    });
    channel.on('ChannelMessage', (message, memberId) => {
        try {
            let data = JSON.parse(message.text);
            if (data.type === 'micOn') {
                let micElem = document.querySelector(`#user-container-${data.uid} .audio-icon`);
                if (micElem) {
                    micElem.classList.remove("muted");
                }
            } else if (data.type === 'micOff') {
                let micElem = document.querySelector(`#user-container-${data.uid} .audio-icon`);
                if (micElem) {
                    micElem.classList.add("muted");
                }
            }
        } catch (error) {
            console.error("Erro ao processar mensagem do canal:", error);
        }
    });


    await getMembers();
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

    client.on('user-joined', handleUserJoined);
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
    let {name} = await rtmClient.getUserAttributesByKeys(String(uid), ['name']);
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

        let player = `<div id="user-container-${uid}" class="user-modal video_container">
                                <div id="user-${uid}" class="video-player">
                                    <div class="audio-indicator">
                                        <div class="audio-icon fullscreen muted"></div>
                                    </div>
                                    <div id="user-avatar-${uid}" class="user-avatar fullscreen">
                                        <img src="https://i.pravatar.cc/150" alt="User Avatar">
                                    </div>
                                    <div id="user-name-${uid}" class="user-name">
                                        ${name}
                                    </div>
                                </div>
                            </div>`;

        document.getElementById('streams__container').insertAdjacentHTML('beforeend', player);
        document.getElementById(`user-container-${uid}`).addEventListener('click', expandVideoFrame);

        await client.publish([localTrack[0]]);
    } catch (error) {
        console.error('Erro ao iniciar o stream:', error);
    }
    initVolumeIndicator();
};

let switchToCamera = async () => {
    let {name} = await rtmClient.getUserAttributesByKeys(String(uid), ['name']);

    let player = `<div id="user-container-${uid}" class="user-modal video_container">
                                <div id="user-${uid}" class="video-player">
                                    <div class="audio-indicator">
                                        <div class="audio-icon fullscreen muted"></div>
                                    </div>
                                    <div id="user-avatar-${uid}" class="user-avatar">
                                        <img src="https://i.pravatar.cc/150" alt="User Avatar">
                                    </div>
                                    <div id="user-name-${uid}" class="user-name">
                                        ${name}
                                    </div>
                                </div>
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

let handleUserJoined = async (user) => {
    console.log(`Usuário entrou: ${user.uid}`);
    let {name} = await rtmClient.getUserAttributesByKeys(String(user.uid), ['name']);

    if (!document.getElementById(`user-container-${user.uid}`)) {
        let player = `<div id="user-container-${user.uid}" class="user-modal video_container">
                        <div id="user-${user.uid}" class="video-player">
                            <div class="audio-indicator">
                                <div class="audio-icon fullscreen muted"></div>
                            </div>
                            <div id="user-avatar-${user.uid}" class="user-avatar fullscreen">
                                <img src="https://i.pravatar.cc/150" alt="User Avatar">
                            </div>
                            <div id="user-name-${uid}" class="user-name">
                                ${name}
                            </div>
                        </div>
                      </div>`;

        document.getElementById('streams__container').insertAdjacentHTML('beforeend', player);
    }
};

let handleUserPublished = async (user, mediaType) => {
    remoteUsers[user.uid] = user;
    let {name} = await rtmClient.getUserAttributesByKeys(String(user.uid), ['name']);

    await client.subscribe(user, mediaType);


    let player = document.getElementById(`user-container-${user.uid}`);

    if (player === null) {
        let player = `<div id="user-container-${user.uid}" class="user-modal video_container">
                                <div id="user-${user.uid}" class="video-player">
                                    <div class="audio-indicator">
                                        <div class="audio-icon fullscreen muted"></div>
                                    </div>
                                    <div id="user-avatar-${user.uid}" class="user-avatar fullscreen">
                                        <img src="https://i.pravatar.cc/150" alt="User Avatar">
                                    </div>
                                    <div id="user-name-${uid}" class="user-name">
                                        ${name}
                                    </div>
                                </div>
                            </div>`;

        document.getElementById('streams__container').insertAdjacentHTML('beforeend', player);
    }

    document.getElementById(`user-container-${user.uid}`).addEventListener('click', expandVideoFrame);

    if (displayFrame.style.display) {
        let videoFrame = document.getElementById(`user-container-${user.uid}`);
        videoFrame.style.height = '150px';
        videoFrame.style.width = '150px';
    }

    if (mediaType === 'video') {
        user.videoTrack.play(`user-${user.uid}`);
    }

    if (mediaType === 'audio') {
        user.audioTrack.play();
    }
};

let handleUserLeft = async (user) => {
    console.log(`Usuário saiu: ${user.uid}`);

    let userElement = document.getElementById(`user-container-${user.uid}`);
    if (userElement) {
        userElement.remove();
    }
};

let toggleMic = async (e) => {
    let button = e.currentTarget;
    let audioIcon = document.querySelector(`#user-container-${uid} .audio-icon`);

    if (localTrack[0].muted) {
        await localTrack[0].setMuted(false);
        wasMicMuted = false;
        button.classList.add('active');

        if (audioIcon) {
            audioIcon.classList.remove('muted');
        }

        channel.sendMessage({text: JSON.stringify({type: 'micOn', uid: uid})});
    } else {
        await localTrack[0].setMuted(true);
        wasMicMuted = true;
        button.classList.remove('active');

        if (audioIcon) {
            audioIcon.classList.add('muted');
        }

        channel.sendMessage({text: JSON.stringify({type: 'micOff', uid: uid})});
    }
};

let toggleCamera = async (e) => {
    let button = e.currentTarget;
    if (!localTrack[1]) {
        localTrack[1] = await AgoraRTC.createCameraVideoTrack();
        await client.publish([localTrack[1]]);
        localTrack[1].play(`user-${uid}`);
        button.classList.add("active");

        document.getElementById(`user-avatar-${uid}`).style.display = "none";

        channel.sendMessage({text: JSON.stringify({type: 'cameraOn', uid: uid})});
    } else {
        if (localTrack[1].isPlaying) {
            localTrack[1].stop();
            await client.unpublish([localTrack[1]]);
            document.getElementById(`user-avatar-${uid}`).style.display = "block";
            button.classList.remove("active");

            channel.sendMessage({text: JSON.stringify({type: 'cameraOff', uid: uid})});
        } else {
            localTrack[1].play(`user-${uid}`);
            await client.publish([localTrack[1]]);
            document.getElementById(`user-avatar-${uid}`).style.display = "none";
            button.classList.add("active");

            channel.sendMessage({text: JSON.stringify({type: 'cameraOn', uid: uid})});
        }
    }
};


let toggleScreen = async (e) => {
    let screenButton = e.currentTarget;
    let cameraButton = document.getElementById('camera-btn');
    let micButton = document.getElementById('mic-btn');
    let {name} = await rtmClient.getUserAttributesByKeys(String(uid), ['name']);

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

        let player = `<div id="user-container-${uid}" class="user-modal video_container">
                                <div id="user-${uid}" class="video-player">
                                    <div class="audio-indicator">
                                        <div class="audio-icon fullscreen muted"></div>
                                    </div>
                                    <div id="user-avatar-${uid}" class="user-avatar fullscreen">
                                        <img src="https://i.pravatar.cc/150" alt="User Avatar">
                                    </div>
                                    <div id="user-name-${uid}" class="user-name">
                                        ${name}
                                    </div>
                                </div>
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
                videoFrames[i].style.height = '150px';
                videoFrames[i].style.width = '150px';
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

    if (localTrack[0]) {
        localTrack[0].stop();
        localTrack[0].close();
    }

    if (localTrack[1]) {
        localTrack[1].stop();
        localTrack[1].close();
    }

    await client.unpublish([localTrack[0], localTrack[1]]);

    if (localScreenTracks) {
        await client.unpublish([localScreenTracks]);
    }

    let userElement = document.getElementById(`user-container-${uid}`);
    if (userElement) {
        userElement.remove();
    }

    if (userIDInDisplayFrame === `user-container-${uid}`) {
        displayFrame.style.display = null;

        for (let i = 0; videoFrames.length > i; i++) {
            videoFrames[i].style.height = '300px';
            videoFrames[i].style.width = '300px';
        }
    }
    channel.sendMessage({text: JSON.stringify({'type': 'user_left_stream', 'uid': uid})});

    console.log(`Usuário ${uid} saiu do stream, mas ainda está na sala.`);
};

let leaveRoom = async () => {
    if (localTrack && localTrack.length > 0) {
        localTrack[0]?.stop();
        localTrack[0]?.close();
        localTrack[1]?.stop();
        localTrack[1]?.close();

        await handleMemberLeft(uid);

        await client.leave();
    }

    window.location.href = "../index.html";
};

async function listAvailableDevices() {
    const devices = await AgoraRTC.getDevices();

    const cameras = devices.filter(device => device.kind === "videoinput");
    const microphones = devices.filter(device => device.kind === "audioinput");

    let cameraSelect = document.getElementById("cameraSelect");
    let micSelect = document.getElementById("micSelect");

    cameraSelect.innerHTML = "";
    micSelect.innerHTML = "";

    cameras.forEach(camera => {
        let option = document.createElement("option");
        option.value = camera.deviceId;
        option.text = camera.label || `Câmera ${camera.deviceId}`;
        cameraSelect.appendChild(option);
    });

    microphones.forEach(mic => {
        let option = document.createElement("option");
        option.value = mic.deviceId;
        option.text = mic.label || `Microfone ${mic.deviceId}`;
        micSelect.appendChild(option);
    });
}

let initVolumeIndicator = () => {
    AgoraRTC.setParameter('AUDIO_VOLUME_INDICATION_INTERVAL', 200);
    client.enableAudioVolumeIndicator();

    client.on('volume-indicator', volumes => {
        //console.log('Volumes', volumes);
        volumes.forEach(volume => {
            //console.log('VOLUME:', volume.level, 'UID:', volume.uid);

            let item = document.getElementById(`user-avatar-${volume.uid}`);

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
document.querySelectorAll('.leave-room').forEach(element => element.addEventListener('click', leaveRoom));


// CONFIGURAÇÕES DO MODAL

document.querySelectorAll('.settings-toggle').forEach(element => element.addEventListener('click', function () {
    document.getElementById("settingsModal").style.display = "flex";
    listAvailableDevices().then(() => {
    }).catch(error => console.error("Erro ao listar dispositivos:", error));
}));

document.getElementById("saveSettings").addEventListener("click", async function () {
    let selectedCamera = document.getElementById("cameraSelect").value;
    let selectedMic = document.getElementById("micSelect").value;

    if (localTrack[1]) {
        await localTrack[1].setDevice(selectedCamera);
    }
    if (localTrack[0]) {
        await localTrack[0].setDevice(selectedMic);
    }

    document.getElementById("settingsModal").style.display = "none";
});

document.getElementById("closeModal").addEventListener("click", function () {
    document.getElementById("settingsModal").style.display = "none";
});

joinRoomInit().then(() => {
}).catch(error => console.error("Erro ao entrar na sala:", error));
