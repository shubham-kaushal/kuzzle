'use strict';

const should = require('should');
const sinon = require('sinon');

const {
  Request,
  BadRequestError,
  SizeLimitError,
} = require('../../../../index');
const KuzzleMock = require('../../../mocks/kuzzle.mock');
const { Profile } = require('../../../../lib/model/security/profile');
const SecurityController = require('../../../../lib/api/controllers/securityController');

describe('Test: security controller - profiles', () => {
  let kuzzle;
  let request;
  let securityController;
  let fakeProfile;

  beforeEach(() => {
    request = new Request(
      { controller: 'security' },
      { user: { _id: 'userId' } });
    kuzzle = new KuzzleMock();
    kuzzle.ask.withArgs('core:storage:private:document:get').resolves({});
    kuzzle.ask.withArgs('core:storage:private:mappings:get').resolves({
      internalIndex: {
        mappings: {
          profiles: {
            properties: {}
          }
        }
      }
    });
    securityController = new SecurityController();

    fakeProfile = new Profile();
    fakeProfile._id = 'fakeProfile';
    fakeProfile.policies = 'policies'.split('');
    fakeProfile.rateLimit = 123;
    sinon.stub(fakeProfile, 'getRights');
  });

  describe('#updateProfileMapping', () => {
    const foo = { foo: 'bar' };

    it('should throw a BadRequestError if the body is missing', () => {
      return should(() => {
        securityController.updateProfileMapping(request);
      }).throw(BadRequestError, { id: 'api.assert.body_required' });
    });

    it('should update the profile mapping', async () => {
      kuzzle.ask.withArgs('core:storage:private:mappings:update').resolves(foo);
      request.input.body = foo;

      const response = await securityController.updateProfileMapping(request);

      should(kuzzle.ask).be.calledWith(
        'core:storage:private:mappings:update',
        kuzzle.internalIndex.index,
        'profiles',
        request.input.body);

      should(response).be.instanceof(Object);
      should(response).match(foo);
    });
  });

  describe('#getProfileMapping', () => {
    it('should fulfill with a response object', async () => {
      kuzzle.ask.withArgs('core:storage:private:mappings:get').resolves({
        properties: { foo: 'bar' },
      });

      const response = await securityController.getProfileMapping(request);

      should(kuzzle.ask).be.calledWith(
        'core:storage:private:mappings:get',
        kuzzle.internalIndex.index,
        'profiles');

      should(response).be.instanceof(Object);
      should(response).match({ mapping: { foo: 'bar' } });
    });
  });

  describe('#createOrReplaceProfile', () => {
    const createOrReplaceEvent = 'core:security:profile:createOrReplace';
    let createOrReplaceStub;

    beforeEach(() => {
      createOrReplaceStub = kuzzle.ask
        .withArgs(createOrReplaceEvent)
        .resolves(fakeProfile);

      request.input.args._id = 'test';
      request.input.body = { policies: [{ roleId: 'role1' }] };
    });

    it('should resolve to an object on a createOrReplaceProfile call', async () => {
      const response = await securityController.createOrReplaceProfile(request);

      should(createOrReplaceStub).calledWithMatch(
        createOrReplaceEvent,
        request.input.args._id,
        request.input.body,
        { refresh: 'wait_for', userId: 'userId' });

      should(response).be.an.Object().and.not.instanceof(Profile);
      should(response).match({
        _id: fakeProfile._id,
        _source: {
          policies: fakeProfile.policies,
          rateLimit: fakeProfile.rateLimit,
        },
      });
    });

    it('should reject in case of error', async () => {
      const error = new Error('Mocked error');

      createOrReplaceStub.rejects(error);

      await should(securityController.createOrReplaceProfile(request))
        .be.rejectedWith(error);

      should(createOrReplaceStub).calledOnce();
    });

    it('should forward refresh option', async () => {
      for (const refresh of [null, false, 'false']) {
        request.input.args.refresh = refresh;

        await securityController.createOrReplaceProfile(request);

        should(createOrReplaceStub).calledWithMatch(
          createOrReplaceEvent,
          request.input.args._id,
          request.input.body,
          { refresh: 'false', userId: 'userId' });
      }
    });

    it('should forward the strict option', async () => {
      for (const strict of [ null, undefined, false ]) {
        request.input.args.strict = strict;

        await securityController.createOrReplaceProfile(request);

        should(createOrReplaceStub).calledWithMatch(
          createOrReplaceEvent,
          request.input.args._id,
          request.input.body,
          { strict: false, userId: 'userId' });
      }

      request.input.args.strict = true;
      await securityController.createOrReplaceProfile(request);

      should(createOrReplaceStub).calledWithMatch(
        createOrReplaceEvent,
        request.input.args._id,
        request.input.body,
        { strict: true, userId: 'userId' });
    });

    it('should throw if an invalid profile format is provided', async () => {
      request.input.body = null;
      await should(securityController.createOrReplaceProfile(request))
        .rejectedWith(BadRequestError, { id: 'api.assert.body_required' });

      request.input.body = {};
      await should(securityController.createOrReplaceProfile(request))
        .rejectedWith(BadRequestError, {
          id: 'api.assert.missing_argument',
          message: 'Missing argument "body.policies".'
        });
      should(createOrReplaceStub).not.called();

      request.input.body = { policies: 'foobar' };
      should(securityController.createOrReplaceProfile(request))
        .rejectedWith(BadRequestError, {
          id: 'api.assert.invalid_type',
          message: 'Wrong type for argument "body.policies" (expected: array)'
        });
      should(createOrReplaceStub).not.called();

      request.input.args._id = null;
      request.input.body = { policies: [] };
      should(securityController.createOrReplaceProfile(request))
        .rejectedWith(BadRequestError, {
          id: 'api.assert.missing_argument',
          message: 'Missing argument "_id".'
        });
      should(createOrReplaceStub).not.called();
    });
  });

  describe('#createProfile', () => {
    const createEvent = 'core:security:profile:create';
    let createStub;

    beforeEach(() => {
      createStub = kuzzle.ask
        .withArgs(createEvent)
        .resolves(fakeProfile);

      request.input.args._id = 'test';
      request.input.body = { policies: [{ roleId: 'role1' }] };

    });

    it('should reject when creating the profile fails', async () => {
      const error = new Error('Mocked error');
      createStub.rejects(error);

      await should(securityController.createProfile(request))
        .be.rejectedWith(error);
    });

    it('should resolve to a formatted object', async () => {
      const response = await securityController.createProfile(request);

      should(createStub).calledWithMatch(
        createEvent,
        request.input.args._id,
        request.input.body,
        { refresh: 'wait_for', userId: 'userId' });

      should(response).be.an.Object().and.not.instanceof(Profile);
      should(response).match({
        _id: fakeProfile._id,
        _source: {
          policies: fakeProfile.policies,
          rateLimit: fakeProfile.rateLimit,
        },
      });
    });

    it('should reject if the profile to create is invalid', async () => {
      request.input.body = null;
      await should(securityController.createProfile(request))
        .rejectedWith(BadRequestError, { id: 'api.assert.body_required' });

      request.input.body = {};
      await should(securityController.createProfile(request))
        .rejectedWith(BadRequestError, {
          id: 'api.assert.missing_argument',
          message: 'Missing argument "body.policies".'
        });
      should(createStub).not.called();

      request.input.body = { policies: 'foobar' };
      await should(securityController.createProfile(request))
        .rejectedWith(BadRequestError, {
          id: 'api.assert.invalid_type',
          message: 'Wrong type for argument "body.policies" (expected: array)'
        });
      should(createStub).not.called();

      request.input.args._id = null;
      request.input.body = { policies: [] };
      await should(securityController.createProfile(request))
        .rejectedWith(BadRequestError, {
          id: 'api.assert.missing_argument',
          message: 'Missing argument "_id".'
        });
      should(createStub).not.called();
    });

    it('should forward refresh option', async () => {
      for (const refresh of [null, false, 'false']) {
        request.input.args.refresh = refresh;

        await securityController.createProfile(request);

        should(createStub).calledWithMatch(
          createStub,
          request.input.args._id,
          request.input.body,
          { refresh: 'false', userId: 'userId' });
      }
    });

    it('should forward the strict option', async () => {
      for (const strict of [ null, undefined, false ]) {
        request.input.args.strict = strict;

        await securityController.createProfile(request);

        should(createStub).calledWithMatch(
          createEvent,
          request.input.args._id,
          request.input.body,
          { strict: false, userId: 'userId' });
      }

      request.input.args.strict = true;
      await securityController.createProfile(request);

      should(createStub).calledWithMatch(
        createEvent,
        request.input.args._id,
        request.input.body,
        { strict: true, userId: 'userId' });
    });

    it('should reject if an invalid profile format is provided', async () => {
      request.input.body = null;
      await should(securityController.createProfile(request))
        .rejectedWith(BadRequestError, { id: 'api.assert.body_required' });

      request.input.body = {};
      await should(securityController.createProfile(request))
        .rejectedWith(BadRequestError, {
          id: 'api.assert.missing_argument',
          message: 'Missing argument "body.policies".'
        });

      request.input.body = { policies: 'foobar' };
      await should(securityController.createProfile(request))
        .rejectedWith(BadRequestError, {
          id: 'api.assert.invalid_type',
          message: 'Wrong type for argument "body.policies" (expected: array)'
        });

      request.input.args._id = null;
      request.input.body = { policies: [] };
      await should(securityController.createProfile(request))
        .rejectedWith(BadRequestError, {
          id: 'api.assert.missing_argument',
          message: 'Missing argument "_id".'
        });
    });
  });

  describe('#getProfile', () => {
    const getEvent = 'core:security:profile:get';
    let getStub;

    beforeEach(() => {
      getStub = kuzzle.ask.withArgs(getEvent);
      request.input.args._id = 'foobar';
    });

    it('should resolve to an object on a getProfile call', async () => {
      getStub.resolves(fakeProfile);

      const response = await securityController.getProfile(request);

      should(getStub).calledWithMatch(getStub, request.input.args._id);

      should(response).be.an.Object().and.not.instanceof(Profile);
      should(response).match({
        _id: fakeProfile._id,
        _source: {
          policies: fakeProfile.policies,
          rateLimit: fakeProfile.rateLimit,
        },
      });
    });

    it('should reject an error on a getProfile call without id', async () => {
      request.input.args._id = null;

      await should(securityController.getProfile(request))
        .rejectedWith(BadRequestError, { id: 'api.assert.missing_argument' });

      should(getStub).not.be.called();
    });

    it('should reject if it cannot get the profile', async () => {
      const error = new Error('foobar');

      getStub.rejects(error);

      await should(securityController.getProfile(request))
        .be.rejectedWith(error);

      should(getStub).calledWith(getEvent, request.input.args._id);
    });
  });

  describe('#mGetProfiles', () => {
    const mGetEvent = 'core:security:profile:mGet';
    let mGetStub;

    beforeEach(() => {
      mGetStub = kuzzle.ask.withArgs(mGetEvent);
      request.input.body = { ids: 'ids'.split('') };
    });

    it('should reject if the ids argument is not provided', async () => {
      request.input.body.ids = undefined;

      await should(securityController.mGetProfiles(request))
        .rejectedWith(BadRequestError, { id: 'api.assert.missing_argument' });

      should(mGetStub).not.called();
    });

    it('should reject in case of error', async () => {
      const error = new Error('Mocked error');

      mGetStub.rejects(error);

      await should(securityController.mGetProfiles(request))
        .be.rejectedWith(error);

      should(mGetStub).calledWith(mGetEvent, request.input.body.ids);
    });

    it('should resolve to an object on a mGetProfiles call', async () => {
      mGetStub.resolves([fakeProfile, fakeProfile, fakeProfile]);

      const response = await securityController.mGetProfiles(request);

      should(response).be.an.Object();
      should(response.hits).be.an.Array().and.have.length(3);

      for (const hit of response.hits) {
        should(hit).be.an.Object().and.not.instanceof(Profile);
        should(hit).match({
          _id: fakeProfile._id,
          _source: {
            policies: fakeProfile.policies,
            rateLimit: fakeProfile.rateLimit,
          },
        });
      }
    });
  });

  describe('#searchProfiles', () => {
    const searchEvent = 'core:security:profile:search';
    let searchStub;

    beforeEach(() => {
      searchStub = kuzzle.ask
        .withArgs(searchEvent)
        .resolves({
          hits: [ fakeProfile, fakeProfile, fakeProfile ],
          total: 3,
        });

    });

    it('should return proper search results', async () => {
      request.input.args.from = 13;
      request.input.args.size = 42;
      request.input.args.scroll = 'duration';
      request.input.body = { roles: 'roles'.split('') };

      const response = await securityController.searchProfiles(request);

      should(searchStub).calledWithMatch(
        searchEvent,
        {
          query: { terms: { 'policies.roleId': 'roles'.split('') } }
        },
        {
          from: 13,
          size: 42,
          scroll: 'duration'
        });

      should(response).be.an.Object();
      should(response.hits).be.an.Array().and.have.length(3);
      should(response.total).eql(3);

      for (const hit of response.hits) {
        should(hit).be.an.Object().and.not.instanceof(Profile);
        should(hit._id).eql(fakeProfile._id);
        should(hit._source.policies).eql(fakeProfile.policies);
        should(hit._source.rateLimit).eql(fakeProfile.rateLimit);
      }
    });

    it('should pass an empty array and default options on an empty request', async () => {
      await securityController.searchProfiles(request);

      should(searchStub).calledWithMatch(searchEvent, {}, {
        from: 0,
        size: kuzzle.config.limits.documentsFetchCount,
        scroll: undefined,
      });
    });

    it('should reject if the number of documents per page exceeds the server limits', async () => {
      kuzzle.config.limits.documentsFetchCount = 1;

      request.input.args.from = 0;
      request.input.args.size = 10;

      await should(securityController.searchProfiles(request))
        .rejectedWith(SizeLimitError, {
          id: 'services.storage.get_limit_exceeded'
        });

      should(searchStub).not.called();
    });

    it('should reject if searching fails', () => {
      request.input.body = {};
      const error = new Error('Mocked error');
      searchStub.rejects(error);

      return should(securityController.searchProfiles(request))
        .be.rejectedWith(error);
    });
  });

  describe('#scrollProfiles', () => {
    const scrollEvent = 'core:security:profile:scroll';
    let scrollStub;

    beforeEach(() => {
      scrollStub = kuzzle.ask
        .withArgs(scrollEvent)
        .resolves({
          hits: [fakeProfile, fakeProfile, fakeProfile],
          scrollId: 'foobar',
          total: 3,
        });
    });

    it('should reject if no scrollId is provided', async () => {
      await should(securityController.scrollProfiles(request))
        .rejectedWith(BadRequestError, {
          id: 'api.assert.missing_argument',
          message: 'Missing argument "scrollId".'
        });

      should(scrollStub).not.be.called();
    });

    it('should return an object containing an array of profiles and a scrollId', async () => {
      request.input.args.scrollId = 'barfoo';

      const response = await securityController.scrollProfiles(request);

      should(response).be.an.Object();
      should(response.hits).be.an.Array().and.have.length(3);
      should(response.scrollId).eql('foobar');
      should(response.total).eql(3);

      for (const hit of response.hits) {
        should(hit).be.an.Object().and.not.instanceof(Profile);
        should(hit._id).eql(fakeProfile._id);
        should(hit._source.policies).eql(fakeProfile.policies);
        should(hit._source.rateLimit).eql(fakeProfile.rateLimit);
      }

      should(scrollStub).calledWithMatch(scrollStub, 'barfoo', undefined);
    });

    it('should handle an optional scroll argument', async () => {
      request.input.args.scroll = '42s';
      request.input.args.scrollId = 'barfoo';

      await securityController.scrollProfiles(request);

      should(scrollStub).calledWithMatch(scrollStub, 'barfoo', '42s');
    });
  });

  describe('#updateProfile', () => {
    const updateEvent = 'core:security:profile:update';
    let updateStub;

    beforeEach(() => {
      updateStub = kuzzle.ask.withArgs(updateEvent).resolves(fakeProfile);

      request.input.args._id = 'profileId';
      request.input.body = {
        policies: 'policies'.split(''),
        rateLimit: 123,
      };
    });

    it('should return the updated and serialized profile with default options', async () => {
      const response = await securityController.updateProfile(request);

      should(updateStub).calledWithMatch(
        updateEvent,
        request.input.args._id,
        request.input.body,
        {
          refresh: 'wait_for',
          retryOnConflict: 10,
          userId: request.context.user._id,
        });

      should(response).be.an.Object().and.not.instanceof(Profile);
      should(response).match({
        _id: fakeProfile._id,
        _source: {
          policies: fakeProfile.policies,
          rateLimit: fakeProfile.rateLimit,
        },
      });
    });

    it('should reject if no id is given', async () => {
      request.input.args._id = null;

      await should(securityController.updateProfile(request))
        .rejectedWith(BadRequestError, {
          id: 'api.assert.missing_argument',
          message: 'Missing argument "_id".'
        });

      should(updateStub).not.called();
    });

    it('should reject if no body is given', async () => {
      request.input.body = null;

      await should(securityController.updateProfile(request))
        .rejectedWith(BadRequestError, { id: 'api.assert.body_required' });
    });

    it('should forward provided options', async () => {
      request.input.args.refresh = false;
      request.input.args.retryOnConflict = 123;
      request.input.args.strict = true;

      await securityController.updateProfile(request);

      should(updateStub).calledWithMatch(
        updateEvent,
        request.input.args._id,
        request.input.body,
        {
          refresh: 'false',
          retryOnConflict: 123,
          strict: true,
          userId: request.context.user._id,
        });
    });

    it('should forward any security exception thrown', () => {
      const error = new Error('foo');
      updateStub.rejects(error);

      return should(securityController.updateProfile(request))
        .rejectedWith(error);
    });
  });

  describe('#deleteProfile', () => {
    const deleteEvent = 'core:security:profile:delete';
    let deleteStub;

    beforeEach(() => {
      deleteStub = kuzzle.ask.withArgs(deleteEvent).resolves();

      request.input.args._id = 'profileId';
    });

    it('should return the deleted profile identifier and use default options', async () => {
      const response = await securityController.deleteProfile(request);

      should(deleteStub).calledWithMatch(
        deleteEvent,
        request.input.args._id,
        { refresh: 'wait_for' });

      should(response).be.an.Object().and.match({
        _id: request.input.args._id
      });
    });

    it('should reject with an error in case of error', () => {
      const error = new Error('Mocked error');
      deleteStub.rejects(error);

      return should(securityController.deleteProfile(request))
        .be.rejectedWith(error);
    });

    it('should reject if no _id is provided', async () => {
      request.input.args._id = null;

      await should(securityController.deleteProfile(request))
        .rejectedWith(BadRequestError, {
          id: 'api.assert.missing_argument',
          message: 'Missing argument "_id".'
        });

      should(deleteStub).not.called();
    });
  });

  describe('#getProfileRights', () => {
    const getEvent = 'core:security:profile:get';
    let getStub;

    beforeEach(() => {
      getStub = kuzzle.ask.withArgs(getEvent);
      request.input.args._id = 'test';
    });

    it('should resolve to an object on a getProfileRights call', async () => {
      const rights = {
        rights1: {
          action: 'action',
          collection: 'bar',
          controller: 'controller',
          index: 'foo',
          value: 'allowed',
        },
        rights2: {
          action: '*',
          collection: '*',
          controller: '*',
          index: '*',
          value: 'denied',
        }
      };

      fakeProfile.getRights.resolves(rights);
      getStub.resolves(fakeProfile);

      const response = await securityController.getProfileRights(request);

      should(getStub).calledWith(getEvent, request.input.args._id);

      should(response).be.an.Object();
      should(response.hits).be.an.Array().and.have.length(2);
      should(response.hits.includes(rights.rights1)).be.true();
      should(response.hits.includes(rights.rights2)).be.true();
    });

    it('should reject an error on if invoked without an id', async () => {
      request.input.args._id = null;

      await should(securityController.getProfileRights(request))
        .rejectedWith(BadRequestError, {
          id: 'api.assert.missing_argument',
          message: 'Missing argument "_id".'
        });

      should(getStub).not.called();
    });

    it('should forward exceptions thrown by the security module', () => {
      const error = new Error('foo');
      getStub.rejects(error);

      return should(securityController.getProfileRights(request))
        .rejectedWith(error);
    });
  });

  describe('#mDeleteProfiles', () => {
    it('should forward the request to _mDelete', async () => {
      sinon.stub(securityController, '_mDelete').resolves('foobar');

      const response = await securityController.mDeleteProfiles(request);

      should(securityController._mDelete)
        .be.calledOnce()
        .be.calledWith('profile', request);

      should(response).eql('foobar');
    });
  });
});
