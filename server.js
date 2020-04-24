var app = require("express")();
var server = require("http").Server(app);
var fs = require("fs");
var formidable = require("formidable");
var io = require("socket.io")(server);
var accountSid;
var authToken;
var client;
const MessagingResponse = require("twilio").twiml.MessagingResponse;

//get twilio info (NOT AVAILABLE IN GITHUB FOR SECURITY)
fs.readFile("C:/Atom/nodeSTUFF/Hackathon/accountInfo.txt", function(err, data){
  if (err){console.log("error")}
  else{
    var text = data.toString();
    accountSid = text.slice(0, text.indexOf("?"));
    authToken = text.slice(text.indexOf("?") + 1, text.indexOf("&"));
    client = require('twilio')(accountSid, authToken);

  }
});

var currentContext = "idle";
var response;
var currentPlayers = [];
var winners = [];
var currentQuestion = 0;
var currentAnswer;
var globalTimer;
var timeLeft;
var timerGoing = false;



function checkContext(phNum, callback, message){

  if (currentContext == "idle"){
    response = "Sorry, nothing's is happening right now. Come back when there is a game!";
    callback();
  }
  else if (currentContext == "aboutToStart"){
    response = "Ok, you're all set! Get ready to start receiving questions soon!" + "\nWait here:  https://0c9ad231.ngrok.io/wait";
    currentPlayers.push(phNum);
    callback();
  }
  else if (currentContext == "inGame"){
    if (currentPlayers.indexOf(phNum) != -1){
      console.log("Your answer: " + message);
      console.log("Correct answer: " + currentAnswer);
      if (message.toUpperCase() == currentAnswer){
        response = "Correct! You've moved on to the next round! Stay tuned...";
        winners.push(phNum);

      }
      else{
        response = "Incorrect! Sorry, you're out. Come back next time for a chance to win!";
      }
    }
    else{
      response = "Sorry, you didn't join this game or you were elminated. Come back next time for a chance to win!";
    }
    callback();
  }


}



function checkIfUser(phNum, callback, message){

  fs.readFile(__dirname + "/userInfo.txt", function(err, data){

    if (err){
      console.log(err);
    }
    else{
      var text = data.toString();
    }

    if (text.indexOf(phNum) == -1){
      fs.appendFile(__dirname+  "/userInfo.txt", phNum + "?", function(err){
        if (err){console.log(err);}
      });
      response = "Thanks for joining Text Trivia! We'll notify you when a game is about to start!";
      callback();
    }
    else{
      checkContext(phNum, callback, message);
    }

  });

}

function sendToCurrentPlayers(msg){
  for (var i = 0; i < currentPlayers.length; i++){
    client.messages.create({
      "from":"+17343392951",
      "to": currentPlayers[i],
      "body":msg
    });
  }

}

function askQuestion(question, options){

  var formattedQuestion = question;
  var headers = ["A)", "B)", "C)", "D)"];

  for (var i = 0; i < options.length; i++){
    formattedQuestion = formattedQuestion + "\n" + headers[i] + options[i];
  }

  formattedQuestion = formattedQuestion + "\n" + "20 sec! Go!";

  sendToCurrentPlayers(formattedQuestion);

  io.emit("changeTitle", "Next Question in:");
  timeLeft = 20;
  globalTimer = setInterval(countdown, 1000);
  setTimeout(nextQuestion, 20000);


}

function nextQuestion(){

  console.log(winners);
  if (winners.length == 0){
    sendToCurrentPlayers("Sorry, everybody was eliminated in the last round! Come back next time for more trivia!");
  }
  else{
    currentPlayers = winners;
    if (currentQuestion != "Bonus"){
      currentQuestion += 1;
      if (currentQuestion == 6){
        currentQuestion = "Bonus";
        for (var i = 0; i < winners.length; i++){
          client.messages.create({
            "from":"+17343392951",
            "to": winners[i],
            "body":"There are still other players left! Prepare for the BONUS QUESTION!"
          });
        }
      }
    }
    else{
      for (var i = 0; i < winners.length; i++){
        client.messages.create({
          "from":"+17343392951",
          "to": winners[i],
          "body":"Congrats! You won after facing the bonus question! Amazing!"
        })
      }
    }

    if (winners.length == 1){
      client.messages.create({
        "from":"+17343392951",
        "to": winners[0],
        "body": "Congratulations! You won! Great job!"
      });
      sendToCurrentPlayers("The game has ended!");
    }
    else{
      getQuestion();
    }
  }

}

function getQuestion(){
  winners = [];
  var options = [];

  fs.readFile(__dirname + "/questions.txt", function(err, data){
    if (err){
      console.log(err);
    }
    else{
      var text = data.toString();

      var starter = text.indexOf(currentQuestion.toString() + ")") + 2;
      var q = text.slice(starter, text.indexOf("//", starter));
      console.log("Question is: " + q);


      var choicesStarter = text.indexOf(currentQuestion.toString() + "}") + 2;
      var choices = text.slice(choicesStarter, text.indexOf("//", choicesStarter));
      var done = false;
      var currentPos = 0;
      while (!done){
        var stopper = choices.indexOf(",", currentPos);
        if (stopper == -1){
          done = true;
        }
        else{
          options.push(choices.slice(currentPos, stopper));
          currentPos = stopper + 1;
        }
      }
      console.log("Options are: " + options);

      var ansStarter = text.indexOf("*", text.indexOf(currentQuestion.toString() + "}")) + 1;
      var ans = text.slice(ansStarter, ansStarter + 1);

      currentAnswer = ans;

      //q, ans, and options are the variables that have the info
      askQuestion(q, options);
    }
  });
}

function beginGame(){
  console.log("game has started");
  currentContext = "inGame";
  currentQuestion = 1;

  getQuestion();

}

function sendNotification(msg){


  fs.readFile(__dirname + "/userInfo.txt", function(err, data){

    var text = data.toString();
    var done = false;
    var currentPosition = 0;
    while (!done){
      var qPosition = text.indexOf("?", currentPosition);
      if (qPosition == -1){
        done = true;
      }
      else{
        var currentPhNum = text.slice(currentPosition, qPosition);
        console.log("Sending to: " + currentPhNum);
        client.messages.create({

          "from":"+17343392951",
          "to":currentPhNum,
          "body":msg

        });
        currentPosition = qPosition + 1;
      }
    }


  });


}

app.post("/sms", function(req, res){

 var form = new formidable.IncomingForm();
 form.parse(req, function(err, fields, files){

   var msg = fields.Body
   var num = fields.From;

   function sendResponse(){
     var twiml = new MessagingResponse();
     var message = twiml.message(response);
     res.writeHead(200, {'Content-Type': 'text/xml'});
     res.end(twiml.toString());
   }

   if (msg.toLowercase != "quit"){
    checkIfUser(num, sendResponse, msg);
   }
   else{
     response="You are now unsubscribed. You won't get any more messages.";
     sendResponse();
     fs.readFile(__dirname + "/userInfo.txt", function(err, data){
       var text = data.toString();
       var firstChunk = text.slice(0, text.indexOf(num));
       var secondChunk = text.slice(text.indexOf("?", text.indexOf(num)) + 1, text.length);
       fs.writeFile(__dirname + "/userInfo.txt", firstChunk + secondChunk, function(err){
         if (err){
           console.log(err);
         }
       });
     });
   }




 });


});


app.get("/admin", function(req, res){
  res.sendFile(__dirname + "/gameStarter.html");
});

app.post("/startGame", function(req, res){

  var form = new formidable.IncomingForm();
  form.parse(req, function(err,fields, files){

    if (fields.pwd == "adminisking@12345"){
      currentContext = "aboutToStart";
      sendNotification("A game is about to start in " + fields.delay + " min. Text me back to join in!");

      timeLeft = fields.delay * 60
      setTimeout(beginGame, fields.delay * 60000);
      io.emit("changeTitle", "Game Starts in:");
      globalTimer = setInterval(countdown, 1000);
      res.sendFile(__dirname+  "/gameStarter.html");
    }

  });



});

function countdown(){

  timeLeft--;
  if (timeLeft <= 0){
    clearInterval(globalTimer);
    io.emit("timeUpdate", "The question was sent!");
    timerLeft = 0;
  }
  else{
    io.emit("timeUpdate", timeLeft);
  }

}


app.get("/wait", function(req, res){

  res.sendFile(__dirname + "/waitingScreen.html");

});



server.listen(4500);
console.log("Hi, I'm running now!");
