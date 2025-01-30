let handleMemberJoined = async (MemberId) => {
    console.log('A new member has joined the room:', MemberId);
    addMemberToDom(MemberId);

    let members = await channel.getMembers();
    updateMemberTotal(members);
}

let addMemberToDom = async (MemberId) => {
    let {name} = await rtmClient.getUserAttributesByKeys(MemberId, ['name']);

    let membersWrapper = document.getElementById('member__list');
    let memberItem = `<div class="member__wrapper" id="member__${MemberId}__wrapper">
                                <span class="green__icon"></span>
                                <p class="member_name">${name}</p>
                            </div>`;

    membersWrapper.insertAdjacentHTML('beforeend', memberItem);
}

let updateMemberTotal = async (members) => {
    let total = document.getElementById('members__count');
    //total.innerText = await channel.getMembers().length;
    total.innerText = members.length;
}

let handleMemberLeft = async (MemberId) => {
    console.log('A member has left the room:', MemberId);
    removerMemberFromDom(MemberId);

    let members = await channel.getMembers();
    updateMemberTotal(members);
}

let removerMemberFromDom = async (MemberId) => {
    let membersWrapper = document.getElementById(`member__${MemberId}__wrapper`);
    membersWrapper.remove();
}

let getMembers = async () => {
    let members = await channel.getMembers();
    updateMemberTotal(members);

    for (let i = 0; members.length > i; i++) {
        addMemberToDom(members[i]);
    }
}

let leaveChannel = async () => {
    await channel.leave();
    await rtmClient.logout();
}

window.addEventListener('beforeunload', leaveChannel);