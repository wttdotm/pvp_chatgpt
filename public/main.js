const socket = io();
let sessionID;

const startSessionBtn = document.getElementById('startSessionBtn');
const joinSessionInput = document.getElementById('joinSessionInput');
const joinSessionBtn = document.getElementById('joinSessionBtn');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const sessionDiv = document.getElementById('session');
const chatDiv = document.getElementById('chat');

startSessionBtn.addEventListener('click', () => {
  socket.emit('start_session');
});

joinSessionBtn.addEventListener('click', () => {
  const joinSessionID = joinSessionInput.value.trim();
  if (joinSessionID) {
    socket.emit('join_session', joinSessionID);
  }
});

// Add this function to main.js
function addMessageToChat(message, sender) {
  const messageElement = document.createElement('div');
  messageElement.className = sender;
  messageElement.innerText = `${sender}: ${message}`;
  messagesDiv.appendChild(messageElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Update the sendMessageBtn event listener in main.js
sendMessageBtn.addEventListener('click', () => {
  const message = messageInput.value.trim();
  if (message) {
    addMessageToChat(message, 'You');
    socket.emit('send_message', sessionID, message);
    messageInput.value = '';
  }
});

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

socket.on('session_started', (id) => {
  sessionID = id;
  sessionDiv.style.display = 'none';
  chatDiv.style.display = 'block';
});

socket.on('session_joined', (id) => {
  sessionID = id;
  sessionDiv.style.display = 'none';
  chatDiv.style.display = 'block';
});

socket.on('session_join_failed', () => {
  alert('Failed to join session. Please check the session ID and try again.');
});

socket.on('receive_message', (responseObj) => {
  console.log(responseObj);
  const response = responseObj.response;
  if (response) {
    addMessageToChat(response, 'AI');
  }
});