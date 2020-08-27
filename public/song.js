const container = document.querySelector(".container");
const myTitle = document.querySelector("#myTitle");
let socket;

// This audio stream will be created for every user's incoming stream
//   that's how you hear them
// How to use:
//   * const audio = new AudioStream( firstAudio Buffer )
//   * audio.addBuffer(newBuffer) // When new audio is received, call addBuffer. When a new buffer is added, index increases
//   * audio.getIndex() // returns the audio buffer index that was processed.
//   * audio.shouldReset(newIndex) // Compares the newIndex with the processed audio stream index. If it is smaller, then we know that we need to reprocess
//   * audio.destroy() // stops the mediaSource
function AudioStream(initialBuffer) {
  let sourceBuffer;
  let index = 0; // keeps track of the incoming buffer stream number
  let isReady = false;
  const bufferBacklog = []; // adding mediaBuffer takes time, sometimes we receive a new stream the add is complete
  const mediaSource = new MediaSource();

  // this event marks the start, that it is ready to take in audio buffers
  mediaSource.addEventListener("sourceopen", function () {
    sourceBuffer = mediaSource.addSourceBuffer('audio/webm;codecs="opus"');
    // For video:
    /*
    sourceBuffer = mediaSource.addSourceBuffer( 'video/webm; codecs="opus, vp9"');
    */
    console.log("audio stream is ready!");
    sourceBuffer.appendBuffer(initialBuffer);
    myAudio.play();

    // Thes event runs whenever there is an add
    sourceBuffer.addEventListener("updateend", () => {
      index += 1;
      isReady = true;
      console.log("update ended");
      const nextBuffer = bufferBacklog.shift();
      if (!nextBuffer) {
        return;
      }
      isReady = false;
      sourceBuffer.appendBuffer(nextBuffer);
    });
  });

  const mediaSourceUrl = URL.createObjectURL(mediaSource);
  // For Video:
  /*
  const myAudio = document.createElement("video");
  myAudio.src = mediaSourceUrl;
  container.append(myAudio);
  */
  const myAudio = new Audio(mediaSourceUrl);

  // Helper functions
  this.addBuffer = (buffer) => {
    if (!isReady) {
      bufferBacklog.push(buffer);
      return;
    }
    isReady = false;
    sourceBuffer.appendBuffer(buffer);
  };

  this.shouldReset = (newIndex) => {
    /* If the incoming newIndex is smaller than our current index
     * then we know that the user is transmitting a new recording stream
     */
    return newIndex < index;
  };

  this.destroy = () => {
    mediaSource.endOfStream();
    myAudio.pause();
    console.log("destroying audio");
  };
  this.getIndex = () => index;
}

let mediaRecorder;
// creates a MedieRecorder to record audio stream.
// This will run everytime there is a reset event (when someone joins the connection)
const recordAudio = async () => {
  let counter = 0;
  console.log("creating a media recorder");
  mediaRecorder = new MediaRecorder(stream, {
    // Sample video codec
    //mimeType: 'video/webm; codecs="opus, vp9"',
    mimeType: 'audio/webm; codecs="opus"',
  });

  mediaRecorder.addEventListener("dataavailable", (event) => {
    // Since mediaSource only takes in array buffer and we have audio blob
    //   we need to convert audio blob into array buffer with FileReader
    const reader = new FileReader();
    reader.readAsArrayBuffer(event.data);
    reader.onload = () => {
      myTitle.innerText = `Your socket Id: ${socket.id}, emitting blob ${counter}`;
      socket.emit("audioblob", {
        audioBlob: reader.result,
        index: counter,
      });
      counter += 1;
    };
  });

  mediaRecorder.start(250);
};

let allUsers = {};
// Whenever there is a new socket, we do the following:
//   Destroy all existing media streams
//   stop existing mediaRecorder - start again once this is stopped
//   Clear all existing socket connections and wait for new incoming streams
//      could new audio stream (index 0) come in before the restart event?
//        - no, because on a new connection, everyone gets a restart event first, AND THEN they start publishing
//   Record and Publish new stream
const restart = () => {
  Object.values(allUsers).forEach((v) => {
    try {
      v.destroy();
    } catch (e) {}
  });
  allUsers = {};
  container.innerHTML = "";
  if (mediaRecorder) {
    mediaRecorder.stop();
    mediaRecorder.onstop = () => {
      recordAudio();
    };
  } else {
    recordAudio();
  }
};

/* START -> get audio access, then connect to socket
 * Once you connect to the socket, you will get a restart event.
 *    After getting a restart event, start the audio!
 */
let stream;
navigator.mediaDevices
  .getUserMedia({
    audio: true,
    //video: true,
  })
  .then((s) => {
    stream = s;
    socket = io();
    socket.on("audioblob", ({ socketId, audioBlob, index }) => {
      console.log(
        `audio blob from ${socketId} received for audio buffer at index ${index}`
      );
      if (!audioBlob || !socketId) {
        console.log("no audio blobs");
        return;
      }
      // if Index is 0, it means it is a new audio buffer,
      //   so we want to create a new stream
      if (!index) {
        if (allUsers[socketId]) {
          allUsers[socketId].destroy();
        }
        allUsers[socketId] = new AudioStream(audioBlob);
        return;
      }
      if (allUsers[socketId]) {
        console.log("indexreceived", index, allUsers[socketId].getIndex());
        allUsers[socketId].addBuffer(audioBlob);
      }
    });
    socket.on("restart", restart);
  });
