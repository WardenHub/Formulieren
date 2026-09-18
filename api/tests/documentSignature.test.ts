import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSignaturePageHtml,
  signatureAnchorText,
  dateAnchorText,
  signatureFieldAnchor,
  dateFieldAnchor,
} from '../src/services/documentSignaturePageService.js';
import { buildPackagePayload } from '../src/services/validSignClient.js';

const document = {
  title: 'Programma van Eisen <brandmeld> & co',
  installationCode: '01',
  installationName: null,
  revision: 'B',
  documentNumber: 'PVE-2026-014',
};

const signers = [
  { order: 1, fullName: 'J. Veentjer', capacity: 'Namens Wardenburg' },
  { order: 2, fullName: 'A. de Vries', capacity: null },
];

function pagina() {
  return buildSignaturePageHtml({
    document,
    signers,
    pageCount: 12,
    checksum: 'a'.repeat(64),
    createdAt: new Date('2026-09-18T09:00:00Z'),
  });
}

test('elke ondertekenaar krijgt een eigen anker voor handtekening en datum', () => {
  const html = pagina();

  for (const signer of signers) {
    assert.ok(html.includes(signatureAnchorText(signer.order)), `handtekeninganker ${signer.order} ontbreekt`);
    assert.ok(html.includes(dateAnchorText(signer.order)), `datumanker ${signer.order} ontbreekt`);
  }

  // De ankers moeten uniek zijn, anders plaatst de leverancier twee vakken op elkaar.
  assert.notEqual(signatureAnchorText(1), signatureAnchorText(2));
  assert.notEqual(signatureAnchorText(1), dateAnchorText(1));
});

test('de ankers bevatten geen spaties of leestekens die de zoekactie kunnen breken', () => {
  for (const order of [1, 2, 10]) {
    assert.match(signatureAnchorText(order), /^[A-Z0-9]+$/);
    assert.match(dateAnchorText(order), /^[A-Z0-9]+$/);
  }
});

test('een anker wijst naar de linkerbovenhoek zonder verschuiving', () => {
  const handtekening = signatureFieldAnchor(1);
  assert.equal(handtekening.anchorPoint, 'TOPLEFT');
  assert.equal(handtekening.leftOffset, 0);
  assert.equal(handtekening.topOffset, 0);
  assert.equal(handtekening.index, 0);
  assert.ok(handtekening.width > 0 && handtekening.height > 0);

  const datum = dateFieldAnchor(1);
  assert.ok(datum.width > 0 && datum.height > 0);
  assert.notEqual(handtekening.text, datum.text);
});

test('de pagina toont waar het over gaat, inclusief controlegetal en aantal pagina\'s', () => {
  const html = pagina();

  assert.ok(html.includes('PVE-2026-014'));
  assert.ok(html.includes('revisie B'));
  assert.ok(html.includes('>12<'), 'het aantal pagina\'s hoort zichtbaar te zijn');
  assert.ok(html.includes('a'.repeat(32)), 'het controlegetal hoort zichtbaar te zijn');
  assert.ok(html.includes('J. Veentjer') && html.includes('A. de Vries'));
  assert.ok(html.includes('Namens Wardenburg'));
});

test('tekst uit de database wordt ge-escapet', () => {
  const html = pagina();
  assert.ok(html.includes('Programma van Eisen &lt;brandmeld&gt; &amp; co'));
  assert.ok(!html.includes('<brandmeld>'));
});

test('zonder hoedanigheid blijft het veld zichtbaar leeg in plaats van weggelaten', () => {
  const html = pagina();
  const blokken = html.split('Hoedanigheid').length - 1;
  assert.equal(blokken, signers.length);
  assert.ok(html.includes('>-<') || html.includes('Hoedanigheid</span>-'));
});

const basisPakket = {
  name: '01 Programma van Eisen',
  documentName: 'Programma van Eisen',
  description: 'Ember; installatie 01',
  message: 'Graag tekenen voor akkoord.',
  signers: [
    { roleKey: 'Signer1', firstName: 'Jesse', lastName: 'Veentjer', email: 'a@wardenburg.nl', index: 1, fields: [] },
    { roleKey: 'Signer2', firstName: 'Anna', lastName: 'de Vries', email: 'b@example.com', index: 2, fields: [] },
  ],
};

test('een pakket wordt als concept aangemaakt, nooit direct verstuurd', () => {
  const payload = buildPackagePayload({ ...basisPakket, signingOrderEnforced: false });
  assert.equal(payload.status, 'DRAFT');
  assert.equal(payload.language, 'nl');
  assert.equal(payload.documents.length, 1);
  assert.equal(payload.documents[0].approvals.length, 2);
});

test('zonder afgedwongen volgorde mag iedereen tegelijk tekenen', () => {
  const payload = buildPackagePayload({ ...basisPakket, signingOrderEnforced: false });
  assert.deepEqual(payload.roles.map((r: any) => r.index), [0, 0]);
});

test('met afgedwongen volgorde houdt iedere ondertekenaar zijn eigen plek', () => {
  const payload = buildPackagePayload({ ...basisPakket, signingOrderEnforced: true });
  assert.deepEqual(payload.roles.map((r: any) => r.index), [1, 2]);
});

test('elke rol draagt precies een ondertekenaar met het opgegeven adres', () => {
  const payload = buildPackagePayload({ ...basisPakket, signingOrderEnforced: true });

  for (const role of payload.roles as any[]) {
    assert.equal(role.type, 'SIGNER');
    assert.equal(role.signers.length, 1);
    assert.equal(role.signers[0].id, role.id);
  }

  assert.deepEqual(
    (payload.roles as any[]).map((r) => r.signers[0].email),
    ['a@wardenburg.nl', 'b@example.com']
  );
});

test('een leeg begeleidend bericht wordt weggelaten in plaats van als lege tekst meegestuurd', () => {
  const payload = buildPackagePayload({ ...basisPakket, message: null, signingOrderEnforced: false });
  assert.equal(payload.emailMessage, undefined);
});
