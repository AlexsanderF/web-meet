const uid = Number(sessionStorage.getItem('uid')) || Math.floor(Math.random() * 10000);
const channelName = 'main'; // Pode ser alterado conforme necessário
let client;
let AppID = '';
let localTrack = [];
let remoteUsers = {};

// Função para buscar o token da API
const fetchAgoraToken = async (channelName, uid) => {
    try {
        const response = await fetch('http://127.0.0.1/api/generate-token', {
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
    client = AgoraRTC.createClient({mode: 'rtc', codec: 'vp8'});

    try {
        // Buscar o token da API
        const token = await fetchAgoraToken(roomId, uid);

        console.log('Generated Token:', token);
        console.log('Room ID:', roomId);
        console.log('UID:', uid);

        // Ingressar na sala com o token gerado
        await client.join(AppID, roomId, token, uid);
        console.log('Joined room successfully:', roomId);

        client.on('user-published', handleUserPublished);
        client.on('user-left', handleUserLeft);

        // Iniciar a transmissão local
        joinStream();
    } catch (error) {
        console.error('Erro ao ingressar na sala:', error);
    }
};

let joinStream = async () => {
    try {
        localTrack = await AgoraRTC.createMicrophoneAndCameraTracks();

        let player = `<div class="video_container" id="user-container-${uid}">
                        <div class="video-player" id="user-${uid}"></div>
                      </div>`;

        document.getElementById('streams__container').insertAdjacentHTML('beforeend', player);
        localTrack[1].play(`user-${uid}`);

        await client.publish([localTrack[0], localTrack[1]]);
    } catch (error) {
        console.error('Erro ao iniciar o stream:', error);
    }
};

let handleUserPublished = async (user, mediaType) => {
    remoteUsers[user.uid] = user;

    await client.subscribe(user, mediaType);

    let player = document.getElementById(`user-container-${user.uid}`);

    if (player === null) {
        player = `<div class="video_container" id="user-container-${user.uid}">
                    <div class="video-player" id="user-${user.uid}"></div>
                  </div>`;
        document.getElementById('streams__container').insertAdjacentHTML('beforeend', player);
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
    const player = document.getElementById(`user-container-${user.uid}`);
    if (player) player.remove();
};

joinRoomInit();
