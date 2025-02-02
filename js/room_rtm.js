let handleMemberJoined = async (MemberId) => {
    let {name} = await rtmClient.getUserAttributesByKeys(MemberId, ['name']);

    console.log('A new member has joined the room:', MemberId);
    await addMemberToDom(MemberId);

    let members = await channel.getMembers();
    await updateMemberTotal(members);

    addBotMessageToDom(`Welcome to the room, ${name}! 👋`);
}

let addMemberToDom = async (MemberId) => {
    let {name} = await rtmClient.getUserAttributesByKeys(MemberId, ['name']);

    let membersWrapper = document.getElementById('member__list');
    let memberItem = `<div class="member__wrapper" id="member__${MemberId}__wrapper">
                                <div class="user-info">
                                    <p class="member_name">${name}</p>
                                    <div id="internet-quality-${MemberId}" class="internet-quality"></div>
                                </div>
                            </div>`;

    membersWrapper.insertAdjacentHTML('beforeend', memberItem);

    let qualityElement = document.getElementById(`internet-quality-${MemberId}`);
    if (qualityElement) {
        setupInternetQuality(qualityElement);
    }
}

let updateMemberTotal = async (members) => {
    let total = document.getElementById('members__count');
    //total.innerText = await channel.getMembers().length;
    total.innerText = members.length;
}

let handleMemberLeft = async (MemberId) => {
    console.log('A member has left the room:', MemberId);
    await removerMemberFromDom(MemberId);

    let members = await channel.getMembers();
    await updateMemberTotal(members);
}

let removerMemberFromDom = async (MemberId) => {
    let membersWrapper = document.getElementById(`member__${MemberId}__wrapper`);
    let name = membersWrapper.getElementsByClassName('member_name')[0].textContent;
    addBotMessageToDom(`${name} left the room.`);

    membersWrapper.remove();
}

let getMembers = async () => {
    let members = await channel.getMembers();
    await updateMemberTotal(members);

    for (let i = 0; members.length > i; i++) {
        await addMemberToDom(members[i]);
    }
}

let handleChannelMessage = async (messageData) => {
    console.log('A new message was received.');
    let data = JSON.parse(messageData.text);

    if (data.type === 'chat') {
        addMessageToDom(data.displayName, data.message);
    }

    if (data.type === 'user_left') {
        document.getElementById(`user-container-${data.uid}`).remove();

        if (userIDInDisplayFrame === `user-container-${uid}`) {
            displayFrame.style.display = null;

            for (let i = 0; videoFrames.length > i; i++) {
                videoFrames[i].style.height = '300px';
                videoFrames[i].style.width = '300px';
            }
        }
    }
}

let sendMessage = async (e) => {
    e.preventDefault();

    let message = e.target.message.value;
    await channel.sendMessage({text: JSON.stringify({'type': 'chat', 'message': message, 'displayName': displayName})}); //remover o await se der erro
    addMessageToDom(displayName, message);
    e.target.reset();
}

let addMessageToDom = (name, message) => {
    let messagesWrapper = document.getElementById('messages');
    let newMessage = ` <div class="message__wrapper">
                                <div class="message__body">
                                    <strong class="message__author">${name}</strong>
                                    <p class="message__text">${message}</p>
                                </div>
                              </div>`;

    messagesWrapper.insertAdjacentHTML('beforeend', newMessage);
    let lastMessage = document.querySelector('#messages .message__wrapper:last-child');
    if (lastMessage) {
        lastMessage.scrollIntoView();
    }
}

let addBotMessageToDom = (botMessage) => {
    let messagesWrapper = document.getElementById('messages');
    let newMessage = `<div class="message__wrapper">
                                <div class="message__body__bot">
                                    <strong class="message__author__bot">🤖 The Bot</strong>
                                    <p class="message__text__bot">${botMessage}</p>
                                </div>
                             </div>`;

    messagesWrapper.insertAdjacentHTML('beforeend', newMessage);
    let lastMessage = document.querySelector('#messages .message__wrapper:last-child');
    if (lastMessage) {
        lastMessage.scrollIntoView();
    }
}

let leaveChannel = async () => {
    await channel.leave();
    await rtmClient.logout();
}

window.addEventListener('beforeunload', leaveChannel);

let messageForm = document.getElementById('message__form');
messageForm.addEventListener('submit', sendMessage);

function setupInternetQuality(element) {
    const qualities = [
        {level: 'very-poor', color: '#ff0000'},  // Muito ruim (5)
        {level: 'poor', color: '#ce6122'},       // Ruim (4)
        {level: 'fair', color: '#ffd700'},       // Regular (3)
        {level: 'good', color: '#90EE90'},       // Bom (2)
        {level: 'excellent', color: '#32CD32'}   // Excelente (1)
    ];

    const container = document.createElement('div');
    container.className = 'internet-quality';

    qualities.forEach((quality, index) => {
        const step = document.createElement('div');
        step.className = 'quality-step';
        step.style.height = `${(index + 1) * 3}px`;
        step.style.backgroundColor = quality.color;
        container.appendChild(step);
    });

    element.appendChild(container);
}

function updateNetworkIndicator(localQuality, remoteQuality, memberId) {
    // console.log(`Atualizando UI para UID ${memberId} - Local: ${localQuality}, Remote: ${remoteQuality}`);

    let qualityLevel = Math.max(localQuality, remoteQuality); // Pega o pior dos dois

    let qualityElement = document.getElementById(`internet-quality-${memberId}`);
    if (!qualityElement) return;

    let steps = qualityElement.querySelectorAll('.quality-step');

    steps.forEach((step, index) => {
        step.style.opacity = index < (6 - qualityLevel) ? '1' : '0.3';
    });
}