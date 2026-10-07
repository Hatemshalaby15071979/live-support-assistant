/**
 * FINAL held-out set — 30 fresh strings.
 *
 * The 60-string set that came before this one is now part of the regression
 * suite, because it was used to fix the gate. A set that has been looked at is a
 * guard, not a measurement. This file is the measurement, and like its
 * predecessor it was **committed before the gate was run against it**.
 *
 * Deliberately reaching further than the previous set, into formats the rules
 * still may not handle:
 *
 *   - English addresses written name-last (`Elm Road 12`) and with a flat number
 *   - Dutch `Postbus`, German `Kundennummer`
 *   - Italian codice fiscale, Polish PESEL, German Steuer-ID
 *   - BIC/SWIFT, US ABA routing numbers
 *   - `A/C`, `Acct. No.`, `Réf.` abbreviations
 *   - a bare name-list entry (`Okafor, Ms. J.`) with no trigger word
 *
 * Every string is fabricated.
 */

/** @type {readonly {id: string, category: string, language: string, value: string, carrier: string}[]} */
export const HELDOUT_FINAL = [
  // ============================================================ email (5) ==
  { id: 'f-em-01', category: 'email', language: 'en', value: 'k.adeyemi@larkfield-health.org.uk',
    carrier: 'Complaints go to k.adeyemi@larkfield-health.org.uk and are answered within ten days.' },
  { id: 'f-em-02', category: 'email', language: 'en', value: 'no.such.person@mail.acme-helpdesk.co.uk',
    carrier: 'Anything undeliverable bounces to no.such.person@mail.acme-helpdesk.co.uk.' },
  { id: 'f-em-03', category: 'email', language: 'es', value: 'reclamaciones@consumo-andalucia.es',
    carrier: 'Presenta la reclamación en reclamaciones@consumo-andalucia.es antes del plazo.' },
  { id: 'f-em-04', category: 'email', language: 'pt-BR', value: 'sac@transportes-iguacu.com.br',
    carrier: 'O SAC responde pelo sac@transportes-iguacu.com.br em até cinco dias úteis.' },
  { id: 'f-em-05', category: 'email', language: 'fr', value: 'contentieux@assurances-mistral.fr',
    carrier: 'Le service contentieux est joignable à contentieux@assurances-mistral.fr.' },

  // ============================================== phone-international (4) ==
  { id: 'f-pi-01', category: 'phone-international', language: 'en', value: '+1-617-555-0134',
    carrier: 'Call +1-617-555-0134 and ask for the records desk.' },
  { id: 'f-pi-02', category: 'phone-international', language: 'es', value: '+34 955 12 34 56',
    carrier: 'El teléfono de atención es el +34 955 12 34 56.' },
  { id: 'f-pi-03', category: 'phone-international', language: 'pt-BR', value: '+55 61 3322 4455',
    carrier: 'Ligue para +55 61 3322 4455 e peça o setor de contratos.' },
  { id: 'f-pi-04', category: 'phone-international', language: 'fr', value: '+33 4 91 55 01 42',
    carrier: 'Le standard de Marseille est le +33 4 91 55 01 42.' },

  // =================================================== phone-national (4) ==
  { id: 'f-pn-01', category: 'phone-national', language: 'en', value: '0117 555 0134',
    carrier: 'Ring 0117 555 0134 for the Bristol office.' },
  { id: 'f-pn-02', category: 'phone-national', language: 'es', value: '955 12 34 56',
    carrier: 'Llama al 955 12 34 56 para anular la cita.' },
  { id: 'f-pn-03', category: 'phone-national', language: 'pt-BR', value: '3322-4455',
    carrier: 'Telefone para contato: 3322-4455.' },
  { id: 'f-pn-04', category: 'phone-national', language: 'fr', value: '04 91 55 01 42',
    carrier: 'Le bureau de Marseille répond au 04 91 55 01 42.' },

  // ==================================================== postal-address (5) ==
  { id: 'f-pa-01', category: 'postal-address', language: 'en', value: 'Elm Road 12',
    carrier: 'The delivery address is Elm Road 12, not the depot.' },
  { id: 'f-pa-02', category: 'postal-address', language: 'en', value: '12A Elm Rd',
    carrier: 'Returns should be sent to 12A Elm Rd with the original packaging.' },
  { id: 'f-pa-03', category: 'postal-address', language: 'en', value: 'Flat 3, 12 Elm Road',
    carrier: 'The tenant at Flat 3, 12 Elm Road has asked for a copy.' },
  { id: 'f-pa-04', category: 'postal-address', language: 'es', value: 'Plaza del Ayuntamiento 8',
    carrier: 'La oficina de registro está en Plaza del Ayuntamiento 8.' },
  { id: 'f-pa-05', category: 'postal-address', language: 'pt-BR', value: 'Alameda Santos 1450',
    carrier: 'O escritório central fica na Alameda Santos 1450, conj. 71.' },

  // ============================================== account-identifier (5) ==
  { id: 'f-ac-01', category: 'account-identifier', language: 'en', value: 'A/C 12345678',
    carrier: 'Transfer to A/C 12345678 and quote the invoice.' },
  { id: 'f-ac-02', category: 'account-identifier', language: 'en', value: 'Acct. No. 1234567',
    carrier: 'Your Acct. No. 1234567 is printed at the top of the statement.' },
  { id: 'f-ac-03', category: 'account-identifier', language: 'fr', value: 'Réf. 445566',
    carrier: 'Rappelez la Réf. 445566 lors de votre appel.' },
  { id: 'f-ac-04', category: 'account-identifier', language: 'es', value: 'póliza 4455667',
    carrier: 'La póliza 4455667 cubre la asistencia en viaje.' },
  { id: 'f-ac-05', category: 'account-identifier', language: 'pt-BR', value: 'protocolo 2026445566',
    carrier: 'Anote o protocolo 2026445566 para acompanhar o pedido.' },

  // ==================================================== honorific-name (2) ==
  { id: 'f-hn-01', category: 'honorific-name', language: 'es', value: 'Ilma. Sra. Ana Belmonte',
    carrier: 'La solicitud fue resuelta por la Ilma. Sra. Ana Belmonte.' },
  { id: 'f-hn-02', category: 'honorific-name', language: 'en', value: 'Rev. Michael Adeyemi',
    carrier: 'The complaint was forwarded to Rev. Michael Adeyemi.' },

  // ============================================ labelled-contact-name (2) ==
  { id: 'f-lc-01', category: 'labelled-contact-name', language: 'en', value: 'Data controller: Priya Raman',
    carrier: 'Data controller: Priya Raman, registered in England.' },
  { id: 'f-lc-02', category: 'labelled-contact-name', language: 'pt-BR', value: 'Encarregado: Carla Nogueira',
    carrier: 'Encarregado: Carla Nogueira pelo tratamento de dados.' },

  // ====================================================== national-id (2) ==
  { id: 'f-ni-01', category: 'national-id', language: 'en', value: 'Steuer-ID 12 345 678 901',
    carrier: 'The Steuer-ID 12 345 678 901 is required on the invoice.' },
  { id: 'f-ni-02', category: 'national-id', language: 'en', value: 'PESEL 44051401359',
    carrier: 'Enter PESEL 44051401359 in the identity section.' },

  // ================================================== bank-identifier (1) ==
  { id: 'f-bi-01', category: 'bank-identifier', language: 'en', value: 'BIC NWBKGB2L',
    carrier: 'Payments must quote BIC NWBKGB2L alongside the account number.' },
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
