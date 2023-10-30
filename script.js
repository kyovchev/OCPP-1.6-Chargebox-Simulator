var timesRun = 0;

var c = 0;
var possible =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
var id = randomId();
var _websocket = null;
var connector_locked = false;


function randomId() {
  id = "";
  for (var i = 0; i < 36; i++) {
    id += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return id;
}

function wsConnect() {
  var wsurl = $("select").val();
  var CP = $("#CP").val();

  if (_websocket) {
    $("#red").show();
    _websocket.close(3001);
  } else {
    _websocket = new WebSocket(wsurl + "" + CP, ["ocpp1.6", "ocpp1.5"]);
    _websocket.onopen = function (authorizationData) {
      sessionStorage.setItem("LastAction", "BootNotification");
      $("#blue").show();
      BootNotification();

      $("#connect").text("Disconnect").css("background", "green");
    };

    _websocket.onmessage = function (msg) {
      c++;
      var ddata = JSON.parse(msg.data);
      console.log(ddata);
      if (c == 1) {
        var hb_interval = handleData(ddata);
        sessionStorage.setItem("Configuration", hb_interval);
        startHB(hb_interval * 1000);
      }

      if (ddata[0] === 3) {
        la = getLastAction();

        if (la == "startTransaction") {
          logMsg("Data exchange successful!");
          var transactionId = ddata[2].transactionId;
          $("#transactionId").val(transactionId);
          logMsg("TransactionId: " + transactionId);
          console.log("TransactionId: " + JSON.stringify(transactionId));
          document.getElementById("ConnectorStatus").value = "Charging";
        }
        if (la === "stopTransaction") {
          document.getElementById("ConnectorStatus").value = "Charging";
        }
        logMsg("Response: " + JSON.stringify(ddata[2]));
      } else if (JSON.parse(msg.data)[0] === 4) {
        logMsg("Data exchange failed - JSON is not accepted!");
      } else if (JSON.parse(msg.data)[0] === 2) {
        logMsg(JSON.parse(msg.data)[2]);
        id = JSON.parse(msg.data)[1];

        switch (ddata[2]) {
          case "Reset":
            //Reset type SOFT, HARD
            var ResetS = JSON.stringify([3, id, { status: "Accepted" }]);
            _websocket.send(ResetS);
            location.reload();
            break;
          case "RemoteStopTransaction":
            //TransactionID
            var remStp = JSON.stringify([3, id, { status: "Accepted" }]);
            _websocket.send(remStp);

            $("#transactionId").val(JSON.parse(msg.data)[3].transactionId);

            stopTransaction();
            $(".indicator").hide();
            $("#blue").show();
            break;
          case "RemoteStartTransaction":
            //Need to get idTag, connectorId (map - ddata[3])
            $("#TAG").val(ddata[3].idTag);
            var remStrt = JSON.stringify([3, id, { status: "Accepted" }]);
            _websocket.send(remStrt);
            startTransaction();

            break;
          case "UnlockConnector": /////////ERROR!!!!!!!!
            //connectorId
            var UC = JSON.stringify([3, id, { status: "Accepted" }]);
            _websocket.send(UC);
            // connector_locked = false;
            // $('.indicator').hide();
            //$('#blue').show();
            //logMsg("Connector status changed to: "+connector_locked);
            break;
          case "TriggerMessage":
            // Called by CPMS asking ChargePoint to execute the instruction
            // Implemented for MeterValues

            switch (ddata[3].requestedMessage) {
              case "MeterValues":
                var remStrt = JSON.stringify([3, id, { status: "Accepted" }]);
                _websocket.send(remStrt);
                send_meterValue();
                break;
              default:
                var error = JSON.stringify([4, id]);
                _websocket.send(error);
            }

            break;
          default:
            var error = JSON.stringify([4, id]);
            _websocket.send(error);
            break;
        }
      }
    };

    _websocket.onclose = function (evt) {
      $("#connect").text("Connect").css("background", "#369");
      if (evt.code == 3001) {
        logMsg("ws closed");
        _websocket = null;
      } else {
        logMsg("ws connection error: " + evt.code);
        $("#messages").html("");
        _websocket = null;
        wsConnect();
      }
    };

    _websocket.onerror = function (evt) {
      if (_websocket.readyState == 1) {
        $("#red").show();
        logMsg("ws normal error: " + evt.type);
      }
    };
  }
}

function logMsg(err) {
  console.log(err);
  $("#messages").append("<li>" + err + "</li>");
  $("#console").scrollTop($("#console").prop('scrollHeight'));
}

function Authorize() {
  sessionStorage.setItem("LastAction", "Authorize");
  var Auth = JSON.stringify([
    2,
    id,
    "Authorize",
    { idTag: $("#TAG").val() },
  ]);
  _websocket.send(Auth);
}

function startTransaction() {
  sessionStorage.setItem("LastAction", "startTransaction");
  $(".indicator").hide();
  $("#green").show();
  connector_locked = true;
  logMsg("Connector status changed to: " + connector_locked);
  var connectorId = parseInt($("#CUID").val());
  console.log("connectorId", connectorId);
  var strtT = JSON.stringify([
    2,
    id,
    "StartTransaction",
    {
      connectorId: connectorId,
      idTag: $("#TAG").val(),
      timestamp: new Date().toISOString(),
      meterStart: parseInt($("#metervalue").val()),
      reservationId: 0,
    },
  ]);
  _websocket.send(strtT);
}

function stopTransaction() {
  sessionStorage.setItem("LastAction", "stopTransaction");
  $(".indicator").hide();
  connector_locked = false;
  logMsg("Connector status changed to: " + connector_locked);
  $("#blue").show();
  var stpT = JSON.stringify([
    2,
    id,
    "StopTransaction",
    {
      transactionId: Number($("#transactionId").val()),
      idTag: $("#TAG").val(),
      timestamp: new Date().toISOString(),
      meterStop: parseInt($("#metervalue").val()),
      reason: "Remote"
    },
  ]);
  _websocket.send(stpT);
}

function handleData(data, request = false) {
  var lastAction = getLastAction();
  if ((lastAction = "BootNotification")) {
    data = data[2];
    heartbeat_interval = data.interval;
    return heartbeat_interval;
  } else if ((lastAction = "StartTransaction")) {
    return "StartTransaction";
  } else if (1 == 2) {
    alert("else");
  }
}

function getLastAction() {
  var LastAction = sessionStorage.getItem("LastAction");
  return LastAction;
}

function BootNotification() {
  var BN = JSON.stringify([
    2,
    id,
    "BootNotification",
    {
      chargePointVendor: "AVT-Company",
      chargePointModel: "AVT-Express",
      chargePointSerialNumber: "avt.001.13.1",
      chargeBoxSerialNumber: "avt.001.13.1.01",
      firmwareVersion: "0.9.87",
      iccid: "",
      imsi: "",
      meterType: "AVT NQC-ACDC",
      meterSerialNumber: "avt.001.13.1.01",
    },
  ]);

  logMsg("ws connected");

  _websocket.send(BN);
}

function startHB(interval) {
  logMsg("Setting heartbeat interval to " + interval);
  setInterval(send_heartbeat, interval);
}

function send_heartbeat() {
  sessionStorage.setItem("LastAction", "Heartbeat");
  var HB = JSON.stringify([2, id, "Heartbeat", {}]);
  _websocket.send(HB);
}

function send_meterValue() {
  console.log("mv");

  sessionStorage.setItem("LastAction", "MeterValues");
  var val = $("#metervalue").val();
  console.log(1);
  var MV = JSON.stringify([
    2,
    id,
    "MeterValues",
    {
      connectorId: 1,
      transactionId: Number($("#transactionId").val()),
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [{ value: val }],
        },
      ],
    },
  ]);

  console.log(2, MV);
  _websocket.send(MV);
}

$(document).ready(function () {
  $(".indicator").hide();
  $("#red").show();

  //bind controls
  $("#connect").click(function () {
    $(".indicator").hide();
    $("#messages").html("");
    wsConnect();
  });

  $("#send").click(function () {
    Authorize();
  });

  $("#start").click(function () {
    startTransaction();
  });

  $("#stop").click(function () {
    stopTransaction();
  });
  $("#mv").click(function () {
    send_meterValue();
  });
  $("#mvp").click(function () {
    var i = Number($("#meterInterval").val());
    var timesRun = 0;
    var interval = setInterval(function () {
      timesRun += 1;
      var val = Number($("#metervalue").val());
      var incrementvalue = Number($("#meterIncrement").val());
      var counter = Number($("#meterSendTimes").val());
      var Myelement = document.getElementById("metervalue");
      console.log(Myelement.value);
      Myelement.value = (val + incrementvalue).toString();;
      console.log("mvp", val, incrementvalue, interval, counter);
      if (timesRun === counter) {
        timesRun = 0;
        clearInterval(interval);
      }
      //do whatever here..
      send_meterValue();
    }, i);
  });

  $("#heartbeat").click(function () {
    send_heartbeat();
  });

  $("#status").click(function () {
    sessionStorage.setItem("LastAction", "StatusNotification");
    console.log("sss", $("#ConnectorStatus").val());
    var SN = JSON.stringify([
      2,
      id,
      "StatusNotification",
      {
        connectorId: parseInt($("#CUID").val()),
        status: $("#ConnectorStatus").val(),
        errorCode: "NoError",
        info: "",
        timestamp: new Date().toISOString()
      },
    ]);
    _websocket.send(SN);
  });

  $("#data_transfer").click(function () {
    sessionStorage.setItem("LastAction", "DataTransfer");
    var DT = JSON.stringify([
      2,
      id,
      "DataTransfer",
      {
        vendorId: "rus.avt.cp",
        messageId: "GetChargeInstruction",
        data: "",
      },
    ]);
    _websocket.send(DT);
  });

  $("#connect").on("change", function () {
    if (_websocket) {
      _websocket.close(3001);
    }
  });
});