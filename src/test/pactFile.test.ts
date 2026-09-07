import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikePactContract, parsePactContract, findPactIssues, PactParseError } from '../pactFile';

// Real fixture (trimmed to what parsing needs), v2 spec, fetched via
// `gh api` from gitlabhq/gitlabhq spec/contracts/.../pipelines#show-
// delete_pipeline.json on 2026-09-07. Uses the singular `providerState`.
const V2_FIXTURE = {
  consumer: { name: 'Pipelines#show' },
  provider: { name: 'DELETE pipeline' },
  interactions: [
    {
      description: 'a request to delete the pipeline',
      providerState: 'a pipeline for a project exists',
      request: { method: 'POST', path: '/api/graphql' },
      response: { status: 200 },
    },
  ],
  metadata: { pactSpecification: { version: '2.0.0' } },
};

// Real fixture, v3 spec, fetched via `gh api` from
// pact-foundation/pact_broker spec/support/markdown_pact_v3.json on
// 2026-09-07. Uses the `providerStates` array with multiple entries.
const V3_FIXTURE = {
  provider: { name: 'Some Provider' },
  consumer: { name: 'Some Consumer' },
  interactions: [
    {
      description: 'a request to list all alligators in Tel Aviv',
      providerStates: [
        { name: 'alligators exist', params: {} },
        { name: 'the city of Tel Aviv has a zoo', params: {} },
      ],
      request: { method: 'get', path: '/alligators' },
      response: { status: 200 },
    },
  ],
  metadata: { pactSpecification: { version: '3.0.0' } },
};

test('looksLikePactContract accepts a real v2 fixture', () => {
  assert.equal(looksLikePactContract(V2_FIXTURE), true);
});

test('looksLikePactContract accepts a real v3 fixture', () => {
  assert.equal(looksLikePactContract(V3_FIXTURE), true);
});

test('looksLikePactContract rejects unrelated JSON', () => {
  assert.equal(looksLikePactContract({ name: 'package.json', version: '1.0.0' }), false);
  assert.equal(looksLikePactContract(null), false);
  assert.equal(looksLikePactContract([1, 2, 3]), false);
});

test('parsePactContract reads consumer/provider/spec version from the real v2 fixture', () => {
  const contract = parsePactContract(V2_FIXTURE);
  assert.equal(contract.consumerName, 'Pipelines#show');
  assert.equal(contract.providerName, 'DELETE pipeline');
  assert.equal(contract.specVersion, '2.0.0');
  assert.equal(contract.interactions.length, 1);
});

test('parsePactContract normalizes the v2 singular providerState into providerStateNames', () => {
  const contract = parsePactContract(V2_FIXTURE);
  assert.deepEqual(contract.interactions[0].providerStateNames, ['a pipeline for a project exists']);
  assert.equal(contract.interactions[0].method, 'POST');
  assert.equal(contract.interactions[0].path, '/api/graphql');
  assert.equal(contract.interactions[0].status, 200);
});

test('parsePactContract normalizes the v3 providerStates array into providerStateNames', () => {
  const contract = parsePactContract(V3_FIXTURE);
  assert.deepEqual(contract.interactions[0].providerStateNames, ['alligators exist', 'the city of Tel Aviv has a zoo']);
  assert.equal(contract.interactions[0].method, 'GET'); // uppercased
});

test('parsePactContract throws PactParseError on non-Pact JSON', () => {
  assert.throws(() => parsePactContract({ foo: 'bar' }), PactParseError);
});

test('findPactIssues finds nothing wrong with a well-formed contract', () => {
  assert.deepEqual(findPactIssues(parsePactContract(V2_FIXTURE)), []);
});

test('findPactIssues flags an interaction with no provider state at all', () => {
  const contract = parsePactContract({
    consumer: { name: 'C' },
    provider: { name: 'P' },
    interactions: [{ description: 'a request with no precondition', request: {}, response: { status: 200 } }],
  });
  const findings = findPactIssues(contract);
  assert.deepEqual(findings, [{ kind: 'missing-provider-state', description: 'a request with no precondition' }]);
});

test('findPactIssues flags two interactions sharing the same description + provider state (silently overwritten by Pact)', () => {
  const contract = parsePactContract({
    consumer: { name: 'C' },
    provider: { name: 'P' },
    interactions: [
      { description: 'gets the user', providerState: 'user exists', request: {}, response: { status: 200 } },
      { description: 'gets the user', providerState: 'user exists', request: {}, response: { status: 404 } },
    ],
  });
  const findings = findPactIssues(contract);
  assert.deepEqual(findings, [{ kind: 'duplicate-interaction', description: 'gets the user', providerState: 'user exists', count: 2 }]);
});

test('findPactIssues does NOT flag two interactions with the same description but DIFFERENT provider states', () => {
  const contract = parsePactContract({
    consumer: { name: 'C' },
    provider: { name: 'P' },
    interactions: [
      { description: 'gets the user', providerState: 'user exists', request: {}, response: { status: 200 } },
      { description: 'gets the user', providerState: 'user does not exist', request: {}, response: { status: 404 } },
    ],
  });
  assert.deepEqual(findPactIssues(contract), []);
});

test('findPactIssues keeps full multi-word descriptions intact in duplicate findings', () => {
  const contract = parsePactContract({
    consumer: { name: 'C' },
    provider: { name: 'P' },
    interactions: [
      { description: 'a request to list all the alligators in the zoo', request: {}, response: { status: 200 } },
      { description: 'a request to list all the alligators in the zoo', request: {}, response: { status: 200 } },
    ],
  });
  const duplicate = findPactIssues(contract).find((f) => f.kind === 'duplicate-interaction');
  assert.equal(duplicate?.description, 'a request to list all the alligators in the zoo');
});
