const request = require('request');
const promisify = require('js-promisify');
const SourceCore = require('proxy-supervisor').SourceCore;

const link = 'https://nordvpn.com/wp-admin/admin-ajax.php?searchParameters%5B0%5D%5Bname%5D=proxy-country' +
             '&searchParameters%5B0%5D%5Bvalue%5D=&searchParameters%5B1%5D%5Bname%5D=proxy-ports' +
             '&searchParameters%5B1%5D%5Bvalue%5D=&offset={0}&limit=25&action=getProxies';

const protocol = str => (str === 'HTTPS' ? 'https://' : 'http://');

const Source = class Source extends SourceCore {
  constructor({ interval = 5 * 60 * 1000 } = {}) {
    super();

    this.interval = interval;
    this._timeout = null;

    this.start();
  }

  /*
    Use only in case you need to stop monitoring manually.

    Monitor is started automatically on creation and can work
    with empty list of listeners.
  */
  start() {
    if (this._timeout) return;
    if (this.interval < 0) this.interval = 5 * 60 * 1000;

    const self = this;
    function endless() {
      self.load().then(() => {
        if (self._timeout) self._timeout = setTimeout(endless, self.interval);
      });
    }
    this._timeout = setTimeout(endless, this.interval);
  }

  stop() {
    if (this._timeout) clearTimeout(this._timeout);
    this._timeout = null;
  }

  /*
    Loads new proxies. Returns promise, which resolves into an array of proxies.
  */
  load() {
    const links = Array.from(new Array(15), (val, i) => link.replace('{0}', i * 25));
    return Promise.all(
      links.map(uri => promisify(request, [{ uri, method: 'GET' }]))
    )
    .then(results => results.reduce((acc, cur) => acc.concat(JSON.parse(cur.body)), []))
    .then((proxies) => {
      const addresses = proxies
          .filter(p => p.type === 'HTTP' || p.type === 'HTTPS')
          .map(p => protocol(p.type) + p.ip + ':' + p.port);

      if (addresses.length === 0) return [];
      // add them to listeners
      this.listeners.forEach((listener) => {
        listener.add(addresses);
      });

      return addresses;
    });
  }

};

/**
 * Export default singleton.
 *
 * @api public
 */
let instance = null;
module.exports = () => {
  if (instance === null) instance = new Source();
  return instance;
};

/**
 * Expose constructor.
 */
module.exports.Source = Source;
