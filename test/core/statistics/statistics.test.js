'use strict';

const should = require('should');

const {
  Request,
  RequestContext,
  BadRequestError
} = require('../../../index');
const Kuzzle = require('../../mocks/kuzzle.mock');

const Statistics = require('../../../lib/core/statistics/statistics');

describe('Test: statistics core component', () => {
  let request;
  let kuzzle;
  let stats;
  const lastFrame = Date.now();
  const fakeStats = {
    connections: new Map(),
    ongoingRequests: new Map(),
    completedRequests: new Map(),
    failedRequests: new Map()
  };

  before(() => {
    fakeStats.connections.set('foo', 42 );
    fakeStats.ongoingRequests.set('bar', 1337 );
    fakeStats.completedRequests.set('baz', 666 );
    fakeStats.failedRequests.set('qux', 667 );
  });

  beforeEach(() => {
    request = new Request({
      controller: 'server',
      action: '',
      requestId: 'foo',
      collection: '',
      body: {}
    });

    kuzzle = new Kuzzle();
    stats = new Statistics();
    stats.enabled = true;
  });

  afterEach(() => {
    if (stats.timer) {
      clearTimeout(stats.timer);
    }
  });

  it('should initialize with a set of exposed methods', () => {
    should(stats.startRequest).be.a.Function();
    should(stats.completedRequest).be.a.Function();
    should(stats.failedRequest).be.a.Function();
    should(stats.newConnection).be.a.Function();
    should(stats.dropConnection).be.a.Function();
    should(stats.getStats).be.a.Function();
    should(stats.getLastStats).be.a.Function();
    should(stats.getAllStats).be.a.Function();
  });

  it('should register a new request when asked to', () => {
    request.context.protocol = 'foobar';
    stats.startRequest(request);
    should(stats.currentStats.ongoingRequests.get('foobar')).not.be.undefined().and.be.exactly(1);
    stats.startRequest(request);
    should(stats.currentStats.ongoingRequests.get('foobar')).not.be.undefined().and.be.exactly(2);
  });

  it('should do nothing when startRequest is called with invalid arguments', () => {
    stats.startRequest();
    should(stats.currentStats.ongoingRequests).be.empty();

    stats.startRequest(request);
    should(stats.currentStats.ongoingRequests).be.empty();
  });

  it('should do nothing for startRequest if module is disabled', () => {
    request.context.protocol = 'foobar';
    stats.enabled = false;

    stats.startRequest();

    should(stats.currentStats.ongoingRequests).be.empty();
  });

  it('should handle completed requests', () => {
    stats.currentStats.ongoingRequests.set('foobar', 2);
    request.context.protocol = 'foobar';
    stats.completedRequest(request);
    should(stats.currentStats.ongoingRequests.get('foobar')).not.be.undefined().and.be.exactly(1);
    should(stats.currentStats.completedRequests.get('foobar')).not.be.undefined().and.be.exactly(1);
    stats.completedRequest(request);
    should(stats.currentStats.ongoingRequests.get('foobar')).not.be.undefined().and.be.exactly(0);
    should(stats.currentStats.completedRequests.get('foobar')).not.be.undefined().and.be.exactly(2);
  });

  it('should do nothing when completedRequest is called with invalid arguments', () => {
    stats.completedRequest();
    should(stats.currentStats.completedRequests).be.empty();

    stats.completedRequest(request);
    should(stats.currentStats.completedRequests).be.empty();
  });

  it('should do nothing for completedRequest if module is disabled', () => {
    stats.currentStats.ongoingRequests.set('foobar', 2);
    request.context.protocol = 'foobar';
    stats.enabled = false;

    stats.completedRequest();

    should(stats.currentStats.completedRequests).be.empty();
  });

  it('should handle failed requests', () => {
    stats.currentStats.ongoingRequests.set('foobar', 2);
    request.context.protocol = 'foobar';

    stats.failedRequest(request);
    should(stats.currentStats.ongoingRequests.get('foobar')).not.be.undefined().and.be.exactly(1);
    should(stats.currentStats.failedRequests.get('foobar')).not.be.undefined().and.be.exactly(1);
    stats.failedRequest(request);
    should(stats.currentStats.ongoingRequests.get('foobar')).not.be.undefined().and.be.exactly(0);
    should(stats.currentStats.failedRequests.get('foobar')).not.be.undefined().and.be.exactly(2);
  });

  it('should do nothing when failedRequest is called with invalid arguments', () => {
    stats.failedRequest();
    should(stats.currentStats.failedRequests).be.empty();

    stats.failedRequest(request);
    should(stats.currentStats.failedRequests).be.empty();
  });

  it('should do nothing for failedRequest if module is disabled', () => {
    stats.currentStats.ongoingRequests.set('foobar', 2);
    request.context.protocol = 'foobar';
    stats.enabled = false;

    stats.failedRequest(request);

    should(stats.currentStats.failedRequests).be.empty();
  });

  it('should handle new connections', () => {
    const context = new RequestContext({ connection: { protocol: 'foobar' } });
    stats.newConnection(context);
    should(stats.currentStats.connections.get('foobar')).not.be.undefined().and.be.exactly(1);
    stats.newConnection(context);
    should(stats.currentStats.connections.get('foobar')).not.be.undefined().and.be.exactly(2);
  });

  it('should not handle new connections if module is disabled', () => {
    const context = new RequestContext({ connection: { protocol: 'foobar' } });
    stats.enabled = false;

    stats.newConnection(context);

    should(stats.currentStats.connections.get('foobar')).be.undefined();
  });

  it('should be able to unregister a connection', () => {
    const context = new RequestContext({ connection: { protocol: 'foobar' } });

    stats.currentStats.connections.set('foobar', 2);
    stats.dropConnection(context);
    should(stats.currentStats.connections.get('foobar')).be.exactly(1);
    stats.dropConnection(context);
    should(stats.currentStats.connections.get('foobar')).be.undefined();
  });

  it('should not handle unregister a connection if module is disabled', () => {
    const context = new RequestContext({ connection: { protocol: 'foobar' } });
    stats.currentStats.connections.set('foobar', 2);
    stats.enabled = false;

    stats.dropConnection(context);

    should(stats.currentStats.connections.get('foobar')).be.exactly(2);
  });

  it('should return the current frame when there is still no statistics in cache', () => {
    stats.currentStats = fakeStats;
    request.input.args.startTime = lastFrame - 10000000;
    request.input.args.stopTime = new Date(new Date().getTime() + 10000);

    return stats.getStats(request)
      .then(response => {
        should(response.hits).be.an.Array();
        should(response.hits).have.length(1);
        should(response.total).be.exactly(1);

        ['completedRequests', 'connections', 'failedRequests', 'ongoingRequests'].forEach(k => {
          should(response.hits[0][k]).match(Object.fromEntries(fakeStats[k]));
        });
        should(response.hits[0].timestamp).be.a.Number();
      });
  });

  it('should return the current frame from the cache when statistics snapshots have been taken', async () => {
    stats.lastFrame = lastFrame;
    request.input.args.startTime = lastFrame - 1000;
    request.input.args.stopTime = new Date(new Date().getTime() + 100000);

    kuzzle.ask
      .withArgs('core:cache:internal:searchKeys')
      .resolves([
        '{stats/}' + lastFrame,
        '{stats/}'.concat(lastFrame + 100)
      ]);

    const returnedFakeStats = {
      completedRequests: Object.fromEntries(fakeStats.completedRequests),
      connections: Object.fromEntries(fakeStats.connections),
      failedRequests: Object.fromEntries(fakeStats.failedRequests),
      ongoingRequests: Object.fromEntries(fakeStats.ongoingRequests)
    };

    kuzzle.ask
      .withArgs('core:cache:internal:mget')
      .resolves([
        JSON.stringify(returnedFakeStats),
        JSON.stringify(returnedFakeStats),
      ]);

    const response = await stats.getStats(request);

    should(response.hits).be.an.Array();
    should(response.hits).have.length(2);
    should(response.total).be.exactly(2);

    ['completedRequests', 'connections', 'failedRequests', 'ongoingRequests'].forEach(k => {
      should(response.hits[0][k]).match(Object.fromEntries(fakeStats[k]));
    });

    should(response.hits[0].timestamp).be.a.Number();
  });

  it('should return an empty statistics because the asked date is in the future', () => {
    stats.lastFrame = lastFrame;
    request.input.args.startTime = new Date(new Date().getTime() + 10000);

    return stats.getStats(request)
      .then(response => {
        should(response.hits).be.an.Array();
        should(response.hits).have.length(0);
        should(response.total).be.exactly(0);
      });
  });

  it('should return all statistics because startTime is not defined', async () => {
    stats.lastFrame = lastFrame;
    request.input.args.stopTime = lastFrame + 1000;

    kuzzle.ask
      .withArgs('core:cache:internal:searchKeys')
      .resolves([
        '{stats/}' + lastFrame,
        '{stats/}'.concat(lastFrame + 100),
      ]);

    kuzzle.ask
      .withArgs('core:cache:internal:mget')
      .resolves([
        JSON.stringify(fakeStats),
        JSON.stringify(fakeStats),
      ]);

    const response = await stats.getStats(request);

    should(response.hits).be.an.Array();
    should(response.hits).have.length(2);
    should(response.total).be.exactly(2);
  });

  it('should manage statistics errors', () => {
    stats.lastFrame = lastFrame;
    request.input.args.startTime = 'a string';
    request.input.args.stopTime = 'a string';

    return should(stats.getStats(request)).be.rejectedWith(BadRequestError);
  });

  it('should get the last frame from the cache when statistics snapshots have been taken', async () => {
    stats.lastFrame = lastFrame;
    const returnedFakeStats = {
      completedRequests: Object.fromEntries(fakeStats.completedRequests),
      connections: Object.fromEntries(fakeStats.connections),
      failedRequests: Object.fromEntries(fakeStats.failedRequests),
      ongoingRequests: Object.fromEntries(fakeStats.ongoingRequests)
    };

    kuzzle.ask
      .withArgs('core:cache:internal:get')
      .resolves(JSON.stringify(returnedFakeStats));

    const response = await stats.getLastStats();

    should(response).be.an.Object();

    ['completedRequests', 'connections', 'failedRequests', 'ongoingRequests'].forEach(k => {
      should(response[k]).match(Object.fromEntries(fakeStats[k]));
    });
    should(response.timestamp).be.approximately(Date.now(), 500);
  });

  it('should return the current frame instead of all statistics if no cache has been initialized', () => {
    stats.currentStats = fakeStats;

    return stats.getAllStats()
      .then(response => {
        should(response.hits).be.an.Array();
        should(response.hits).have.length(1);
        should(response.total).be.exactly(1);
        ['completedRequests', 'connections', 'failedRequests', 'ongoingRequests'].forEach(k => {
          should(response.hits[0][k]).match(Object.fromEntries(fakeStats[k]));
        });
      });
  });

  it('should return all saved statistics', async () => {
    stats.lastFrame = lastFrame;

    kuzzle.ask
      .withArgs('core:cache:internal:searchKeys')
      .resolves([
        '{stats/}' + lastFrame,
        '{stats/}'.concat(lastFrame + 100),
      ]);

    const returnedFakeStats = {
      completedRequests: Object.fromEntries(fakeStats.completedRequests),
      connections: Object.fromEntries(fakeStats.connections),
      failedRequests: Object.fromEntries(fakeStats.failedRequests),
      ongoingRequests: Object.fromEntries(fakeStats.ongoingRequests)
    };

    kuzzle.ask
      .withArgs('core:cache:internal:mget')
      .resolves([
        JSON.stringify(returnedFakeStats),
        JSON.stringify(returnedFakeStats),
      ]);

    const response = await stats.getAllStats();

    should(response.hits).be.an.Array();
    should(response.hits).have.length(2);
    should(response.total).be.exactly(2);

    ['completedRequests', 'connections', 'failedRequests', 'ongoingRequests'].forEach(k => {
      should(response.hits[0][k]).match(Object.fromEntries(fakeStats[k]));
    });

    should(response.hits[0].timestamp).be.a.Number();

    ['completedRequests', 'connections', 'failedRequests', 'ongoingRequests'].forEach(k => {
      should(response.hits[1][k]).match(Object.fromEntries(fakeStats[k]));
    });

    should(response.hits[1].timestamp).be.a.Number();
  });

  it('should write statistics frames in cache', async () => {
    stats.currentStats = Object.assign({}, fakeStats);

    await stats.writeStats();

    should(stats.currentStats.completedRequests).be.empty();
    should(stats.currentStats.failedRequests).be.empty();
    should(kuzzle.ask).calledWith(
      'core:cache:internal:store',
      '{stats/}' + stats.lastFrame,
      JSON.stringify(fakeStats),
      { ttl: stats.ttl });
  });

  it('should not write statistics frames in cache if module is disabled', async () => {
    stats.currentStats = Object.assign({}, fakeStats);
    stats.enabled = false;

    await stats.writeStats();

    should(kuzzle.ask).not.be.called();
  });

  it('should reject the promise if the cache returns an error', () => {
    stats.lastFrame = Date.now();

    kuzzle.ask.withArgs('core:cache:internal:get').rejects(new Error());

    return should(stats.getLastStats(request)).be.rejected();
  });
});
