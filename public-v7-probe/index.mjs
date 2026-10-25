import {createHash} from 'node:crypto';
import {BlobClient} from '@azure/storage-blob';
import {internalArtifactTwirpClient} from '../node_modules/@actions/artifact/lib/internal/shared/artifact-twirp-client.js';
import {getBackendIdsFromToken} from '../node_modules/@actions/artifact/lib/internal/shared/util.js';
import {StringValue} from '../node_modules/@actions/artifact/lib/generated/index.js';

const ids = getBackendIdsFromToken();
const client = internalArtifactTwirpClient({maxAttempts: 1});
const name = 'public-v7-' + process.env.GITHUB_RUN_ID;
const body = Buffer.from(JSON.stringify({probe: 'public-v7'}));
const created = await client.CreateArtifact({
  workflowRunBackendId: ids.workflowRunBackendId,
  workflowJobRunBackendId: ids.workflowJobRunBackendId,
  name, version: 7,
  mimeType: StringValue.create({value: 'application/json'}),
});
await new BlobClient(created.signedUploadUrl).getBlockBlobClient().uploadData(body, {
  blobHTTPHeaders: {blobContentType: '\u0085application/json'},
});
const finalized = await client.FinalizeArtifact({
  workflowRunBackendId: ids.workflowRunBackendId,
  workflowJobRunBackendId: ids.workflowJobRunBackendId,
  name, size: String(body.length),
  hash: StringValue.create({value: 'sha256:' + createHash('sha256').update(body).digest('hex')}),
});
const id = String(finalized.artifactId);
const api = 'https://api.github.com/repos/' + process.env.GITHUB_REPOSITORY + '/actions/artifacts/' + id + '/zip';
const auth = await fetch(api, {redirect: 'manual', headers: {
  authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
  accept: 'application/vnd.github.v3+json',
  'user-agent': 'public-v7-probe',
}});
const anon = await fetch(api, {redirect: 'manual', headers: {
  accept: 'application/vnd.github.v3+json',
  'user-agent': 'public-v7-probe',
}});
const location = auth.headers.get('location');
const signed = location ? new URL(location) : null;
const downloaded = location ? await fetch(location) : null;
const result = {
  id, name,
  uploadPermission: new URL(created.signedUploadUrl).searchParams.get('sp'),
  authStatus: auth.status,
  anonStatus: anon.status,
  authRsct: signed?.searchParams.get('rsct') ?? null,
  anonRsct: anon.headers.get('location') ? new URL(anon.headers.get('location')).searchParams.get('rsct') : null,
  rawStatus: downloaded?.status ?? null,
  rawContentType: downloaded?.headers.get('content-type') ?? null,
  matches: downloaded ? Buffer.from(await downloaded.arrayBuffer()).equals(body) : false,
};
console.log('PUBLIC_V7_PROBE ' + JSON.stringify(result));
