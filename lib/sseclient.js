var util    = require('util'),
    events  = require('events'),
    zlib    = require('zlib');

module.exports = SSEClient;

const MATCH_DEFLATE = /\bdeflate\b/i;
const MATCH_GZIP = /\bgzip\b/i;

function SSEClient(req, res) {
  this.req = req;
  this.res = res;
  var self = this;
  res.on('close', function() {
    self.emit('close');
  });
}

util.inherits(SSEClient, events.EventEmitter);

SSEClient.prototype.initialize = function() {
  this.req.socket.setNoDelay(true);

  const resHead = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  };

  const acceptEncoding = this.req.headers['accept-encoding'];
  if (acceptEncoding && acceptEncoding.match(MATCH_DEFLATE)) {
    resHead['Content-Encoding'] = 'deflate';
    this.output = zlib.createDeflate({ flush: zlib.constants.Z_SYNC_FLUSH });
    this.output.pipe(this.res);
  } else if (acceptEncoding && acceptEncoding.match(MATCH_GZIP)) {
    resHead['Content-Encoding'] = 'gzip';
    this.output = zlib.createGzip({ flush: zlib.constants.Z_SYNC_FLUSH });
    this.output.pipe(this.res);
  } else {
    this.output = this.res;
  }

  this.res.writeHead(200, resHead);
  this.output.write(':ok\n\n');
};

SSEClient.prototype.send = function(event, data, id) {
  if (arguments.length === 0) return;

  var senderObject = {
    event : event || undefined,
    data  : data || undefined,
    id    : id || undefined,
    retry : undefined
  };

  if (typeof event == 'object') {
    senderObject.event   = event.event || undefined,
    senderObject.data    = event.data || undefined,
    senderObject.id      = event.id || undefined,
    senderObject.retry   = event.retry || undefined
  }

  if (typeof event != 'object' && arguments.length === 1) {
    senderObject.event   = undefined;
    senderObject.data    = event;
  }

  if (senderObject.event) this.output.write('event: ' + senderObject.event + '\n');
  if (senderObject.retry) this.output.write('retry: ' + senderObject.retry + '\n');
  if (senderObject.id) this.output.write('id: ' + senderObject.id + '\n');

  senderObject.data = senderObject.data.replace(/(\r\n|\r|\n)/g, '\n');
  var dataLines = senderObject.data.split(/\n/);

  for (var i = 0, l = dataLines.length; i < l; ++i) {
    var line = dataLines[i];
    if ((i+1) === l) this.output.write('data: ' + line + '\n\n');
    else this.output.write('data: ' + line + '\n');
  }
}

SSEClient.prototype.close = function() {
  this.output.end();
}
