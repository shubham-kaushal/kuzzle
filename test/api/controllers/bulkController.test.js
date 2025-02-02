'use strict';

const should = require('should');
const sinon = require('sinon');

const { 
  BadRequestError,
  MultipleErrorsError,
  Request
} = require('../../../index');
const KuzzleMock = require('../../mocks/kuzzle.mock');
const mockAssertions = require('../../mocks/mockAssertions');

const BulkController = require('../../../lib/api/controllers/bulkController');
const { NativeController } = require('../../../lib/api/controllers/baseController');
const actionEnum = require('../../../lib/core/realtime/actionEnum');

describe('Test the bulk controller', () => {
  let controller;
  let kuzzle;
  let index;
  let collection;
  let request;

  beforeEach(() => {
    collection = 'yellow-taxi';

    index = 'nyc-open-data';

    request = new Request({
      controller: 'bulk',
      collection,
      index
    });

    kuzzle = new KuzzleMock();

    controller = mockAssertions(new BulkController());
  });

  describe('#constructor', () => {
    it('should inherit the base constructor', () => {
      should(controller).instanceOf(NativeController);
    });
  });

  describe('#import', () => {
    let bulkData;

    beforeEach(() => {
      bulkData = ['fake', 'data'];

      request.input.action = 'bulk';

      request.input.body = { bulkData };

      kuzzle.ask.withArgs('core:storage:public:document:bulk').resolves({
        items: ['fake', 'data'],
        errors: []
      });
    });

    it('should trigger the proper methods and resolve to a valid response', async () => {
      const response = await controller.import(request);

      should(kuzzle.ask).be.calledWith(
        'core:storage:public:document:bulk',
        index,
        collection,
        bulkData,
        { refresh: 'false', userId: null });

      should(response).match({
        successes: ['fake', 'data'],
        errors: []
      });
    });

    it('should handle errors', async () => {
      kuzzle.ask.withArgs('core:storage:public:document:bulk').resolves({
        items: [],
        errors: ['fake', 'data']
      });

      const response = await controller.import(request);

      should(response).match({
        successes: [],
        errors: ['fake', 'data']
      });
    });

    it('should throw an error in strict mode if at least one import has failed', () => {
      request.input.args.strict = true;

      kuzzle.ask.withArgs('core:storage:public:document:bulk').resolves({
        items: [],
        errors: ['fake', 'data']
      });

      should(controller.import(request)).be.rejectedWith(
        MultipleErrorsError,
        { id: 'api.process.incomplete_multiple_request' });
    });
  });

  describe('#write', () => {
    let _source;
    let _id;
    let notifyStub;

    beforeEach(() => {
      _id = 'tolkien';
      _source = { name: 'Feanor', silmarils: 3 };

      request.input.action = 'write';
      request.input.body = _source;
      request.input.args._id = _id;

      kuzzle.ask
        .withArgs('core:storage:public:document:createOrReplace')
        .resolves({
          _id,
          _source,
          _version: 1,
          result: 'created',
        });

      notifyStub = kuzzle.ask.withArgs(
        'core:realtime:document:notify',
        sinon.match.object,
        sinon.match.number,
        sinon.match.object);
    });

    it('should createOrReplace the document without injecting meta', async () => {
      const response = await controller.write(request);

      should(notifyStub).not.called();
      should(kuzzle.ask).be.calledWith(
        'core:storage:public:document:createOrReplace',
        index,
        collection,
        _id,
        _source,
        { refresh: 'false', injectKuzzleMeta: false });

      should(response).match({
        _id,
        _source,
        _version: 1,
      });
    });

    it('should send "document written" notifications if asked to', async () => {
      request.input.args.notify = true;

      kuzzle.ask
        .withArgs('core:storage:public:document:createOrReplace')
        .resolves({
          _id,
          _source,
          _version: 1,
          result: 'created',
          created: true,
        });

      await controller.write(request);

      should(notifyStub).be.calledWithMatch(
        'core:realtime:document:notify',
        request,
        actionEnum.WRITE,
        { _id, _source });
    });
  });

  describe('#mWrite', () => {
    let documents;
    let mCreateOrReplaceResult;
    let notifyMChangesStub;

    beforeEach(() => {
      documents = [
        { name: 'Maedhros' },
        { name: 'Maglor' },
        { name: 'Celegorm' },
        { name: 'Caranthis' },
        { name: 'Curufin' },
        { name: 'Amrod' },
        { name: 'Amras' }
      ];

      request.input.action = 'write';
      request.input.body = { documents };

      mCreateOrReplaceResult = [
        { _id: 'maed', _source: { name: 'Maedhros' }, _version: 1, created: true },
        { _id: 'magl', _source: { name: 'Maglor' }, _version: 1, created: true }
      ];

      kuzzle.ask
        .withArgs('core:storage:public:document:mCreateOrReplace')
        .resolves({
          items: mCreateOrReplaceResult,
          errors: []
        });

      notifyMChangesStub = kuzzle.ask.withArgs(
        'core:realtime:document:mNotify',
        sinon.match.object,
        sinon.match.number,
        sinon.match.every(sinon.match.object));
    });

    it('should mCreateOrReplace the document without injecting meta', async () => {
      const response = await controller.mWrite(request);

      should(notifyMChangesStub).not.be.called();
      should(kuzzle.ask).be.calledWith(
        'core:storage:public:document:mCreateOrReplace',
        index,
        collection,
        documents,
        { refresh: 'false', limits: false, injectKuzzleMeta: false });

      should(response).match({
        successes: [
          { _id: 'maed', _source: { name: 'Maedhros' }, _version: 1 },
          { _id: 'magl', _source: { name: 'Maglor' }, _version: 1 }
        ],
        errors: []
      });
    });

    it('should notify if its specified', async () => {
      request.input.args.notify = true;

      await controller.mWrite(request);

      should(notifyMChangesStub).be.calledWith(
        'core:realtime:document:mNotify',
        request,
        actionEnum.WRITE,
        mCreateOrReplaceResult);
    });

    it('should throw an error in strict mode if at least one createOrReplace has failed', () => {
      request.input.args.strict = true;
      kuzzle.ask.withArgs('core:storage:public:document:mCreateOrReplace').resolves({
        items: [],
        errors: [{ name: 'Maedhros' }, { name: 'Maglor' }]
      });

      should(controller.import(request)).be.rejectedWith(
        MultipleErrorsError,
        { id: 'api.process.incomplete_multiple_request' });
    });
  });

  describe('#deleteByQuery', async () => {
    let query;

    beforeEach(() => {
      query = {
        range: { age: { gt: 21 } }
      };

      request.input.action = 'deleteByQuery';
      request.input.args.refresh = 'wait_for';
      request.input.body = { query };

      kuzzle.ask
        .withArgs('core:storage:public:document:deleteByQuery')
        .resolves({
          deleted: 2,
        });
    });

    it('should call deleteByQuery with fetch=false and size=-1', async () => {
      const response = await controller.deleteByQuery(request);

      should(kuzzle.ask).be.calledWith(
        'core:storage:public:document:deleteByQuery',
        index,
        collection,
        query,
        { refresh: 'wait_for', fetch: false, size: -1 });

      should(response.deleted).be.eql(2);
    });
  });

  describe('#updateByQuery', () => {
    let query;
    let changes;
    let esResponse;

    beforeEach(() => {
      query = {
        match: { foo: 'bar' }
      };
      changes = {
        bar: 'foo'
      };

      request.input.body = { query, changes };

      esResponse = {
        updated: 1
      };

      kuzzle.ask
        .withArgs('core:storage:public:bulk:updateByQuery')
        .resolves(esResponse);
    });

    it('should forward to the store module', async () => {
      request.input.args.refresh = 'wait_for';

      const response = await controller.updateByQuery(request);

      should(kuzzle.ask).be.calledWith(
        'core:storage:public:bulk:updateByQuery',
        index,
        collection,
        query,
        changes,
        { refresh: 'wait_for' });
      should(response).be.eql(esResponse);
    });

    it('should have default value for refresh param', async () => {
      await controller.updateByQuery(request);

      should(kuzzle.ask).be.calledWith(
        'core:storage:public:bulk:updateByQuery',
        index,
        collection,
        query,
        changes,
        { refresh: 'false' });
    });

    it('should throw an error if body.query is malformed', () => {
      request.input.body = { query: 'not an object', changes };

      return should(controller.updateByQuery(request)).be.rejectedWith(
        BadRequestError,
        {
          id: 'api.assert.invalid_type',
          message: 'Wrong type for argument "body.query" (expected: object)',
        }
      );
    });

    it('should throw an error if body.changes is malformed', () => {
      request.input.body = { query, missingProperty: 'changes' };

      return should(controller.updateByQuery(request)).be.rejectedWith(
        BadRequestError,
        {
          id: 'api.assert.missing_argument',
          message: 'Missing argument "body.changes".',
        }
      );
    });
  });
});
