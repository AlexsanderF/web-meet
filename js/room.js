let messagesContainer = document.getElementById('messages');
messagesContainer.scrollTop = messagesContainer.scrollHeight;

const memberContainer = document.getElementById('members__container');
const memberButton = document.querySelectorAll('.list-toggle');

const chatContainer = document.getElementById('messages__container');
const chatButtons = document.querySelectorAll('.chat-toggle');

let activeMemberContainer = false;

memberButton.forEach(button => {
    button.addEventListener('click', () => {
        memberContainer.style.display = activeMemberContainer ? 'none' : 'block';
        activeMemberContainer = !activeMemberContainer;
    });
});

let activeChatContainer = false;

chatButtons.forEach(button => {
    button.addEventListener('click', () => {
        chatContainer.style.display = activeChatContainer ? 'none' : 'block';
        activeChatContainer = !activeChatContainer;
    });
});

let displayFrame = document.getElementById('stream__box');
let videoFrame = document.getElementsByClassName('video_container');
let userIDInDisplayFrame = null;

let expandVideoFrame = (e) => {
    let child = displayFrame.children[0];

    if (child) {
        document.getElementById('streams__container').appendChild(child);
    }

    displayFrame.style.display = 'block';
    displayFrame.appendChild(e.currentTarget);
    userIDInDisplayFrame = e.currentTarget.id;

    for (let i = 0; videoFrame.length > i; i++) {
        if (videoFrame[i].id !== userIDInDisplayFrame) {
            videoFrame[i].style.height = '150px';
            videoFrame[i].style.width = '150px';
        }
    }
};

for (let i = 0; videoFrame.length > i; i++) {
    videoFrame[i].addEventListener('click', expandVideoFrame);
}

let hideDisplayFrame = () => {
    userIDInDisplayFrame = null;
    displayFrame.style.display = null;

    let child = displayFrame.children[0];
    document.getElementById('streams__container').appendChild(child);

}

displayFrame.addEventListener('click', hideDisplayFrame);