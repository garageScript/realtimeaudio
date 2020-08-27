const express = require("express");
const fs = require("fs");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

io.on("connection", (socket) => {
  io.emit("restart");
  socket.on("audioblob", ({ audioBlob, index }) => {
    socket.broadcast.emit("audioblob", {
      socketId: socket.id,
      audioBlob,
      index,
    });
    // For writing to file to save audio
    /*
    fs.appendFile("./public/dist/song.wav", audioBlob, (err) => {
      if (err) throw err;
      console.log('The "data to append" was appended to file!');
    });
    */
  });
  console.log(`${socket.id} connected`);
});

app.use(express.static("public"));

const port = process.env.PORT || 3061;
http.listen(port, () => {
  console.log(`listening on *:${port}`);
});
