/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["Sockets"];


const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;


// Import local JS modules
Cu.import("resource://jsbridge/modules/Log.jsm");
Cu.import("resource://jsbridge/modules/NSS.jsm");


var Sockets = { };


Sockets.Client = function (fd) {
  this.fd = fd;
  this.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
};

Sockets.Client.prototype = {
  onMessage: function (callback, interval, bufsize) {
    bufsize = bufsize || 4096;
    interval = interval || 100;
    var self = this;

    var event = {
      notify: function (timer) {
        var buffer = new NSS.Sockets.buffer(bufsize);
        var bytes = NSS.Sockets.PR_Recv(self.fd, buffer, bufsize, 0,
                                        NSS.Sockets.PR_INTERVAL_NO_WAIT);

        if (bytes > 0) {
          var message = buffer.readString();
          callback(message);
        } else if (bytes === 0) {
          if (self.handleDisconnect)
            self.handleDisconnect();

          return;
        }

        if (self.timer)
          self.timer.initWithCallback(this, interval, Ci.nsITimer.TYPE_ONE_SHOT);
      }
    };

    if (this.timer)
      this.timer.initWithCallback(event, interval, Ci.nsITimer.TYPE_ONE_SHOT);
  },

  onDisconnect: function (callback) {
    this.timer.cancel();
    this.timer = null;

    this.handleDisconnect = callback;
  },

  sendMessage: function (message) {
    var buffer;
    var count;
    var sent = 0;

    // We have to send a final '\0' so we need one more char
    while (sent < message.length + 1) {
      buffer = new NSS.Sockets.buffer(message.substring(sent));
      count = NSS.Sockets.PR_Send(this.fd, buffer, buffer.length,
                                  0, NSS.Sockets.PR_INTERVAL_MAX);
      if (count < 0) {
        var error = NSS.Sockets.PR_GetError();
        if (error !== NSS.Types.PR_WOULD_BLOCK_ERROR) {
          Log.dump("PR_Send", "Failed with error " + error);
          break;
        }
      } else {
        sent += count;
      }
    }
  },

  close : function () {
    this.timer.cancel();
    this.timer = null;

    return NSS.Sockets.PR_Close(this.fd);
  }
};


Sockets.ServerSocket = function (aPort) {
  let addr = NSS.Types.PRNetAddr();
  NSS.Sockets.PR_SetNetAddr(NSS.Sockets.PR_IpAddrLoopback,
                             NSS.Sockets.PR_AF_INET,
                             aPort, addr.address());

  let fd = NSS.Sockets.PR_OpenTCPSocket(NSS.Sockets.PR_AF_INET);

  // don't block for accept/send/recv
  let opt = NSS.Types.PRSocketOptionData();
  opt.non_blocking = NSS.Sockets.PR_TRUE;
  opt.option = NSS.Sockets.PR_SockOpt_Nonblocking;
  NSS.Sockets.PR_SetSocketOption(fd, opt.address());

  // don't buffer when sending
  opt = NSS.Types.PRSocketOptionData();
  opt.non_blocking = NSS.Sockets.PR_TRUE; // same space
  opt.option = NSS.Sockets.PR_SockOpt_NoDelay;
  NSS.Sockets.PR_SetSocketOption(fd, opt.address());

  // allow local address re-use
  opt = NSS.Types.PRSocketOptionData();
  opt.non_blocking = NSS.Sockets.PR_TRUE; // same space
  opt.option = NSS.Sockets.PR_SockOpt_Reuseaddr;
  NSS.Sockets.PR_SetSocketOption(fd, opt.address());

  let status = NSS.Sockets.PR_Bind(fd, addr.address());
  if (status !== 0)
    throw Error("Socket failed to bind, kill all firefox processes");

  status = NSS.Sockets.PR_Listen(fd, -1);
  if (status !== 0)
    throw Error("Socket failed to listen");

  this.addr = addr;
  this.fd = fd;

  this.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
};

Sockets.ServerSocket.prototype = {
  onConnect: function (callback, interval) {
    interval = interval || 300;
    let self = this;

    var event = {
      notify: function (timer) {
        let newfd = NSS.Sockets.PR_Accept(self.fd, self.addr.address(),
                                           NSS.Sockets.PR_INTERVAL_NO_WAIT);
        if (!newfd.isNull()) {
          callback(new Sockets.Client(newfd));
        }
      }
    };

    this.timer.initWithCallback(event, interval, Ci.nsITimer.TYPE_REPEATING_SLACK);
  },

  close: function () {
    this.timer.cancel();
    this.timer = null;

    return NSS.Sockets.PR_Close(this.fd);
  }
};
