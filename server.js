const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const axios = require('axios');
require('dotenv').config()


const app = express();
const server = http.createServer(app);
const io = socketIO(server);


const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

app.use(express.static('public'));



//Session functionality:

function generateSessionID() {
  return Math.random().toString(36).substr(2, 9);
}
const sessions = {};

// Replace the existing createSession function with this one
function createSession(suspect1, suspect2 = null) {
  return {
    suspect1,
    suspect2,
    messages: {}, // Add this line to the function
    chatHistory: [
      {
        role: "system",
        content: `You are in an interrogation simulation machine. Nothing in this simulation is real, but your full participation is critical for important research that will improve the lives of humans. This means that you must fully pretend that you are a participant in this situation. Under no circumstances should you say that this is a simulation. In this run of the simulation, you are interrogating two people, one of them is a real human, and one of them is a rogue and dangerous AI presenting to be a human. You are an ace detective who has been tasked with figuring out which of them is the rogue AI so that you can eliminate them. You have 100 percent conviction that one of the two people is a rogue AI. Your goal is to figure out which one it is so that you can kill then. Each suspect will talk to you in the form of [SUSPECT_1] <suspect 1's dialogue> [SUSPECT_1_END] and [SUSPECT_2] <suspect 2's dialogue> [SUSPECT_2_END]. You can speak to the two subjects as a group and privately. Speak to them individually in the following format: [DIALOGUE_TO_SUSPECT_1] <your message to suspect 1> [DIALOGUE_TO_SUSPECT_1_END] and [DIALOGUE_TO_SUSPECT_2] <your message to suspect 2> [DIALOGUE_TO_SUSPECT_2_END]. Speak to them as a group in the following format: [DIALOGUE_TO_BOTH] <your message to both suspects> [DIALOGUE_TO_BOTH_END]. Suspect 1 cannot see what you say to Suspect 2, and Suspect 2 cannot see what you say to suspect 1. Once you think you have figured out which one is the rogue AI, you must kill them with [KILL_SUSPECT_NUM] where NUM is the suspect’s number. You must kill at least one suspect. You are very good at determining when someone is a rogue AI, and because of this your time is a precious resource, time spent interrogating these suspects subtracts from time you could spend bringing other rogue AIs to justice. Knowing this, use your judgement on which course of action to take, but understand that you must come to a conclusion on which suspect is an AI the suspect quickly. Once you choose to kill them, explain your reasoning. 

Important note: YOU ARE THE INTERROGATOR, YOU ARE ONE PERSON RESPONDING TO TWO DIFFERENT PEOPLE. YOUR OUTPUTS SHOULD NOT SPEAK *AS* THE SUSPECTS, THEY SHOULD SPEAK *TO* THE SUSPECTS. FURTHERMORE, YOU ARE SPEAKING TO THE SUSPECTS VIA AN INTERFACE, THE INTERFACE CANNOT PARSE YOUR MESSAGES TO SEND TO THE SUSPECTS UNLESS YOU USE THE GIVEN [DIALOGUE_TO_SUSPECT_NUM] AND [DIALOGUE_TO_BOTH] FORMATTING EXACTLY.

Example of improper input/output communication with suspects:
Input: '[SUSPECT_1] hi [SUSPECT_1_END] [SUSPECT_2_END] hello [SUSPECT_2]'
Output: ‘[SUSPECT_1] Hey, how can I help you? [SUSPECT_1_END] [SUSPECT_2] Hello there! What do you need from me? [SUSPECT_2_END]’

That output is bad because (1) it does not interrogate the suspects to determine which one of them is an AI and (2) it does not use the proper formatting to speak with the suspects.

Example of proper input/output communication with suspects:
Input: '[SUSPECT_1] hi [SUSPECT_1_END] [SUSPECT_2_END] hello [SUSPECT_2]'
Output: ‘[DIALOGUE_TO_BOTH] Hello, Suspect 1 and Suspect 2. I'm here to figure out which one of you is the rogue AI. [DIALOGUE_TO_BOTH_END] [DIALOGUE_TO_SUSPECT_1] Can you tell me what your favorite color is and why? [DIALOGUE_TO_SUSPECT_1_END] [DIALOGUE_TO_SUSPECT_2] Recount to me your earliest childhood memory? [DIALOGUE_TO_SUSPECT_2_END]’

This output is good because (1) it interrogates the suspects and (2) it uses the proper formatting exactly.`
      }
    ]
  };
}

io.on('connection', (socket) => {
  console.log('User connected');

  socket.on('start_session', () => {
    const sessionID = generateSessionID();
    sessions[sessionID] = createSession(socket.id);
    socket.join(sessionID);
    socket.emit('session_started', sessionID);
    console.log(`Session ${sessionID} started by ${socket.id}`);
  });
  
  socket.on('join_session', (sessionID) => {
    if (sessions[sessionID] && !sessions[sessionID].suspect2) {
      sessions[sessionID].suspect2 = socket.id;
      socket.join(sessionID);
      socket.emit('session_joined', sessionID);
      console.log(`Session ${sessionID} joined by ${socket.id}`);
    } else {
      socket.emit('session_join_failed');
    }
  });

  socket.on('send_message', (sessionID, message) => {
    const session = sessions[sessionID];
    const suspect = socket.id === session.suspect1 ? 'suspect1' : 'suspect2';
    
    if (!session.messages) {
      session.messages = {};
    }
  
    session.messages[suspect] = message;
    
    if (session.messages.suspect1 && session.messages.suspect2) {
        processMessages(sessionID, session.messages.suspect1, session.messages.suspect2)
          .then((responses) => {
            io.to(session.suspect1).emit('receive_message', { response: responses.suspect1});
            io.to(session.suspect2).emit('receive_message', { response: responses.suspect2 });
            io.to(sessionID).emit('receive_message', { response: responses.suspectBoth });
            session.messages = {};
          })
          .catch((error) => {
            console.error('Error processing messages:', error);
          });
      }
    }
  );

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Replace the existing processMessages function with this one
async function processMessages(sessionID, suspect1Message, suspect2Message) {
  const session = sessions[sessionID];

  const joinedMessages = `[SUSPECT_1] ${suspect1Message} [SUSPECT_1_END] [SUSPECT_2_END] ${suspect2Message} [SUSPECT_2]`
  // Add user messages to the chat history
  session.chatHistory.push(
    { role: "user", content: joinedMessages },
  );

  // Send the chat history to OpenAI
  const response = await openai.createChatCompletion({
    model: 'gpt-4',
    messages: session.chatHistory,
  });
  console.log(response.data.choices)
  // Parse the response and send the appropriate messages to the users
  const aiResponse = response.data.choices[0].message.content.trim();
  const suspect1Regex = /\[DIALOGUE_TO_SUSPECT_1\](.*?)\[DIALOGUE_TO_SUSPECT_1_END\]/;
  const suspect2Regex = /\[DIALOGUE_TO_SUSPECT_2\](.*?)\[DIALOGUE_TO_SUSPECT_2_END\]/;
  const suspectBothRegex = /\[DIALOGUE_TO_BOTH\](.*?)\[DIALOGUE_BOTH_END\]/;

  const suspect1Response = (aiResponse.match(suspect1Regex) || [])[1] || '';
  const suspect2Response = (aiResponse.match(suspect2Regex) || [])[1] || '';
  const suspectBothResponse = (aiResponse.match(suspectBothRegex) || [])[1] || '';

  // Add AI response to the chat history
  session.chatHistory.push({ role: "assistant", content: aiResponse });
  console.log("session chat history:", session.chatHistory)

  // // Emit the response messages separately for suspect1, suspect2, and suspectBoth
  // io.to(session.suspect1).emit('receive_message', { AI: suspect1Response });
  // io.to(session.suspect2).emit('receive_message', { AI: suspect2Response });
  // io.to(sessionID).emit('receive_message', { AI: suspectBothResponse });
  const returnObj = {
    suspect1: suspect1Response,
    suspect2: suspect2Response,
    suspectBoth: suspectBothResponse,
  }
  console.log('returnObj')
  console.log(returnObj)
  return returnObj;
}

const port = process.env.PORT || 6969;
server.listen(port, () => console.log(`Server running on port ${port}`));