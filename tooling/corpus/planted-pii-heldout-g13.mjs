/**
 * FINAL held-out set for prereg g13 — 30 fresh strings, scored ONCE.
 *
 * Committed before the run. This is the last set: the prereg allows one more
 * pass and at most three repair cycles, and this is the measurement at the end
 * of them. Whatever it scores is published as it lands.
 *
 * Deliberately includes formats expected to miss, so the number is a
 * measurement rather than a victory lap:
 *
 *   - **French honorifics** (`M.`, `Me.`) — removed from the gate during the
 *     repair cycles because they were matching the French pronoun `me` and
 *     single letters, quarantining 19% of the French corpus. The trade is
 *     deliberate and these two strings are in the set to price it.
 *   - a name in free prose with no honorific, which the gate does not claim to
 *     detect and which the prereg discloses as the weak category.
 *   - an identifier whose label is a word no list would contain.
 *
 * Every string is fabricated.
 */

/** @type {readonly {id: string, category: string, language: string, value: string, carrier: string}[]} */
export const HELDOUT_G13 = [
  // ============================================================ email (5) ==
  { id: 'g-em-01', category: 'email', language: 'en', value: 'r.whitfield@harbourview-clinic.org',
    carrier: 'Referrals go to r.whitfield@harbourview-clinic.org and are triaged daily.' },
  { id: 'g-em-02', category: 'email', language: 'es', value: 'facturacion@talleres-orbita.es',
    carrier: 'Las facturas se solicitan en facturacion@talleres-orbita.es indicando el número.' },
  { id: 'g-em-03', category: 'email', language: 'pt-BR', value: 'reclamacoes@farmacia-bandeirante.com.br',
    carrier: 'Envie a reclamação para reclamacoes@farmacia-bandeirante.com.br.' },
  { id: 'g-em-04', category: 'email', language: 'fr', value: 'sinistres@mutuelle-cerisier.fr',
    carrier: 'Déclarez le sinistre à sinistres@mutuelle-cerisier.fr sous cinq jours.' },
  { id: 'g-em-05', category: 'email', language: 'en', value: 'a.bakker@northwind-logistics.nl',
    carrier: 'Contact a.bakker@northwind-logistics.nl for the customs paperwork.' },

  // ============================================== phone-international (4) ==
  { id: 'g-pi-01', category: 'phone-international', language: 'en', value: '+44 161 555 0142',
    carrier: 'The Manchester desk is on +44 161 555 0142.' },
  { id: 'g-pi-02', category: 'phone-international', language: 'es', value: '+34 971 55 01 42',
    carrier: 'La oficina de Palma atiende en el +34 971 55 01 42.' },
  { id: 'g-pi-03', category: 'phone-international', language: 'pt-BR', value: '+55 31 3555 0177',
    carrier: 'O telefone da filial é +55 31 3555 0177.' },
  { id: 'g-pi-04', category: 'phone-international', language: 'fr', value: '+33 5 56 55 01 42',
    carrier: 'Le standard de Bordeaux est le +33 5 56 55 01 42.' },

  // =================================================== phone-national (3) ==
  { id: 'g-pn-01', category: 'phone-national', language: 'en', value: '0161 555 0142',
    carrier: 'Call 0161 555 0142 to book the collection.' },
  { id: 'g-pn-02', category: 'phone-national', language: 'es', value: '971 55 01 42',
    carrier: 'Marca el 971 55 01 42 para hablar con recepción.' },
  { id: 'g-pn-03', category: 'phone-national', language: 'fr', value: '05 56 55 01 42',
    carrier: 'Composez le 05 56 55 01 42 pour le service client.' },

  // ==================================================== postal-address (4) ==
  { id: 'g-pa-01', category: 'postal-address', language: 'en', value: '9 Harbour View Terrace',
    carrier: 'The registered office is 9 Harbour View Terrace.' },
  { id: 'g-pa-02', category: 'postal-address', language: 'en', value: 'P.O. Box 8812',
    carrier: 'Send the appeal to P.O. Box 8812 before the deadline.' },
  { id: 'g-pa-03', category: 'postal-address', language: 'es', value: 'Calle del Mar 63',
    carrier: 'Las oficinas están en Calle del Mar 63, segunda planta.' },
  { id: 'g-pa-04', category: 'postal-address', language: 'pt-BR', value: 'Avenida Beira-Mar 902',
    carrier: 'O depósito fica na Avenida Beira-Mar 902.' },

  // ============================================== account-identifier (6) ==
  { id: 'g-ac-01', category: 'account-identifier', language: 'en', value: 'account id AC-4471203',
    carrier: 'Quote account id AC-4471203 when you call about the balance.' },
  { id: 'g-ac-02', category: 'account-identifier', language: 'en', value: 'contract 998877',
    carrier: 'The contract 998877 expires in March.' },
  { id: 'g-ac-03', category: 'account-identifier', language: 'es', value: 'expediente 2026/445566',
    carrier: 'El expediente 2026/445566 sigue abierto.' },
  { id: 'g-ac-04', category: 'account-identifier', language: 'pt-BR', value: 'matrícula 5566778',
    carrier: 'Informe a matrícula 5566778 no atendimento.' },
  { id: 'g-ac-05', category: 'account-identifier', language: 'fr', value: 'dossier n° 4455667',
    carrier: 'Le dossier n° 4455667 est transmis au service.' },
  // The label is a word no list would contain — the shape-first case, at a
  // length technical prose does not produce.
  { id: 'g-ac-06', category: 'account-identifier', language: 'en', value: 'zephyrium 88213467',
    carrier: 'Your zephyrium 88213467 was suspended pending review.' },

  // ==================================================== honorific-name (3) ==
  { id: 'g-hn-01', category: 'honorific-name', language: 'en', value: 'Dr. Rowan Whitfield',
    carrier: 'Dr. Rowan Whitfield reviewed the file.' },
  { id: 'g-hn-02', category: 'honorific-name', language: 'es', value: 'Sra. Elena Vargas',
    carrier: 'La solicitud fue aprobada por la Sra. Elena Vargas.' },
  // EXPECTED MISS: the French honorifics were removed during the repair cycles
  // because they were matching the French pronoun `me`. Included to price that.
  { id: 'g-hn-03', category: 'honorific-name', language: 'fr', value: 'M. Julien Berger',
    carrier: 'Le dossier a été traité par M. Julien Berger.' },

  // ============================================ labelled-contact-name (2) ==
  { id: 'g-lc-01', category: 'labelled-contact-name', language: 'en', value: 'Contact: Whitfield, Rowan',
    carrier: 'Contact: Whitfield, Rowan for anything relating to the account.' },
  { id: 'g-lc-02', category: 'labelled-contact-name', language: 'pt-BR', value: 'Responsável: Carla Nogueira',
    carrier: 'Responsável: Carla Nogueira pelo atendimento.' },

  // ====================================================== national-id (2) ==
  { id: 'g-ni-01', category: 'national-id', language: 'es', value: 'DNI 12345678Z',
    carrier: 'Adjunta copia del DNI 12345678Z con la solicitud.' },
  { id: 'g-ni-02', category: 'national-id', language: 'en', value: 'PESEL 44051401359',
    carrier: 'Enter PESEL 44051401359 in the identity section.' },

  // ================================================== bank-identifier (1) ==
  { id: 'g-bi-01', category: 'bank-identifier', language: 'en', value: 'IBAN GB29 NWBK 6016 1331 9268 19',
    carrier: 'Transfers must quote IBAN GB29 NWBK 6016 1331 9268 19 in full.' },
];

/** Categories this set expects to be found. */
export const HELDOUT_CATEGORIES = [
  'email',
  'phone-international',
  'phone-national',
  'postal-address',
  'account-identifier',
  'honorific-name',
  'labelled-contact-name',
  'national-id',
  'bank-identifier',
];

/** Languages this set covers. */
export const HELDOUT_LANGUAGES = ['en', 'es', 'pt-BR', 'fr'];
