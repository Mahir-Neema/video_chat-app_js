import "./style.css";

// import {firebase} from "firebase/app";
// import "firebase/firestore";

import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';


const firebaseConfig = {
  apiKey: "AIzaSyCjqfWEFnsPdQq950mvfSBkFlexahwf9KU",
  authDomain: "video-chat-demo-app.firebaseapp.com",
  projectId: "video-chat-demo-app",
  storageBucket: "video-chat-demo-app.appspot.com",
  messagingSenderId: "479963895628",
  appId: "1:479963895628:web:8e1c3258dd99096c7da1e9",
  measurementId: "G-TFD8R33SMS",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const firestore = firebase.firestore();

//Peer Connection
// free stun servers by google
const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

// global state
// all action happen here, emits bunch of events to update the database, adding media streams to the connection
const pc = new RTCPeerConnection(servers);

let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById("webcamButton");
const webcamVideo = document.getElementById("webcamVideo");
const callButton = document.getElementById("callButton");
const callInput = document.getElementById("callInput");
const answerButton = document.getElementById("answerButton");
const remoteVideo = document.getElementById("remoteVideo");
const hangupButton = document.getElementById("hangupButton");
const remoteVideoPlaceholder = document.getElementById("remoteVideoPlaceholder");





// 1. Setup media sources

webcamButton.onclick = async () => {
  // asking user to access webcam
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  remoteStream = new MediaStream();

  // Pushing tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pulling tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};




// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callDoc = firestore.collection("calls").doc();
  const offerCandidates = callDoc.collection("offerCandidates");
  const answerCandidates = callDoc.collection("answerCandidates");

  callInput.value = callDoc.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  // session description protocol
  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;

  // Copy answer call string to clipboard
  const answerCallString = callInput.value;
  navigator.clipboard.writeText(answerCallString);

  // Display popup
  const popup = document.createElement("div");
  popup.className = "popup";
  popup.textContent = "Meet credentials copied to clipboard";
  document.body.appendChild(popup);
  setTimeout(() => {
    popup.remove();
  }, 2000);
};


// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection("calls").doc(callId);
  const answerCandidates = callDoc.collection("answerCandidates");
  const offerCandidates = callDoc.collection("offerCandidates");

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === "added") {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};





hangupButton.onclick = async () => {
  // Close the peer connection
  pc.close();

  // Stop local and remote streams
  localStream.getTracks().forEach((track) => {
    track.stop();
  });
  remoteStream.getTracks().forEach((track) => {
    track.stop();
  });

  // Clear video sources
  webcamVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // Disable buttons
  hangupButton.disabled = true;
  callButton.disabled = true;
  answerButton.disabled = true;
  webcamButton.disabled = false;

  // Reset call input value
  callInput.value = "";
};

