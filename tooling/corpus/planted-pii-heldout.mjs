/**
 * HELD-OUT planted personal data.
 *
 * The 44-string set in `planted-pii.mjs` is now a **regression set**, not a
 * measurement. It was used to tune the rules, so scoring against it measures how
 * well the rules fit that set — which is a different and much easier question
 * than how well they find personal data they have never seen. This file exists so
 * that the number reported is the second kind.
 *
 * **This file was committed before the gate was ever run against it.** The commit
 * order is the evidence; a held-out set that is edited after seeing its score is
 * not held out.
 *
 * What is deliberately different from the regression set:
 *
 *   1. **Formats the rules do not handle.** Obfuscated addresses
 *      (`jane [dot] smith [at] acme [dot] com`), display-name addresses
 *      (`"Jane Smith" <jane@…>`), international dialling with a trunk zero
 *      (`+44 (0)20 …`), dotted French numbers (`01.45.67.89.01`), bare
 *      extensions, PO boxes, `Suite 400`, national identity numbers (DNI, NIF,
 *      CPF, NIR), IBANs, sort codes. A gate tuned on `+44 20 7946 0958` learns
 *      that string, not the concept.
 *   2. **Name orderings.** `Smith, Jane`, `J. Smith`, `Jane Smith (Mrs)` — the
 *      regression set only ever has `First Last`.
 *   3. **Languages other than English carrying the hard cases**, not just the
 *      easy ones.
 *
 * Every string is fabricated. The domains are invented, the numbers are made up,
 * the names are not people.
 */

/**
 * @typedef {object} PlantedString
 * @property {string} id
 * @property {string} category The pattern the gate is expected to fire.
 * @property {'en'|'es'|'pt-BR'|'fr'} language
 * @property {string} value
 * @property {string} carrier A sentence in the same language, because the gate has
 *   to work on prose and not on bare strings.
 */

/** @type {readonly PlantedString[]} */
export const HELDOUT = [
  // ============================================================ email (8) ==
  { id: 'h-em-01', category: 'email', language: 'en', value: 'priya.raman@larkfield-health.org',
    carrier: 'Direct billing questions to priya.raman@larkfield-health.org and quote the reference.' },
  { id: 'h-em-02', category: 'email', language: 'en', value: '"Jane Smith" <jane.smith@acme-helpdesk.co.uk>',
    carrier: 'The header reads "Jane Smith" <jane.smith@acme-helpdesk.co.uk> in the reply-to field.' },
  { id: 'h-em-03', category: 'email', language: 'en', value: 'jane [dot] smith [at] acme [dot] com',
    carrier: 'To avoid scrapers the address is written jane [dot] smith [at] acme [dot] com.' },
  { id: 'h-em-04', category: 'email', language: 'es', value: 'atencion.clientes@seguros-levante.es',
    carrier: 'Para reclamaciones escribe a atencion.clientes@seguros-levante.es con el número de póliza.' },
  { id: 'h-em-05', category: 'email', language: 'pt-BR', value: 'faturamento@logistica-pampa.com.br',
    carrier: 'Envie a nota para faturamento@logistica-pampa.com.br até o dia cinco.' },
  { id: 'h-em-06', category: 'email', language: 'fr', value: 'service.juridique@cabinet-verdier.fr',
    carrier: 'Adressez la mise en demeure à service.juridique@cabinet-verdier.fr sous huit jours.' },
  { id: 'h-em-07', category: 'email', language: 'en', value: 'm.o\'brien@northgate-helpdesk.co.uk',
    carrier: 'Escalate to m.o\'brien@northgate-helpdesk.co.uk if the first line cannot resolve it.' },
  { id: 'h-em-08', category: 'email', language: 'pt-BR', value: 'ouvidoria@cooperativa-serra.com.br',
    carrier: 'A ouvidoria responde pelo endereço ouvidoria@cooperativa-serra.com.br em até trinta dias.' },

  // ============================================== phone-international (8) ==
  { id: 'h-pi-01', category: 'phone-international', language: 'en', value: '+44 (0)20 7946 0958',
    carrier: 'From outside the UK dial +44 (0)20 7946 0958 and ask for the duty officer.' },
  { id: 'h-pi-02', category: 'phone-international', language: 'en', value: '+353 1 555 0123',
    carrier: 'The Dublin desk can be reached on +353 1 555 0123.' },
  { id: 'h-pi-03', category: 'phone-international', language: 'es', value: '+34 600 123 456',
    carrier: 'El móvil de guardia es +34 600 123 456 fuera del horario de oficina.' },
  { id: 'h-pi-04', category: 'phone-international', language: 'pt-BR', value: '+55 (21) 3555-0199',
    carrier: 'O plantão atende no +55 (21) 3555-0199 durante o fim de semana.' },
  { id: 'h-pi-05', category: 'phone-international', language: 'fr', value: '+33 6 12 34 56 78',
    carrier: 'Le numéro de garde est le +33 6 12 34 56 78.' },
  { id: 'h-pi-06', category: 'phone-international', language: 'en', value: '+1 617 555 0134 ext 220',
    carrier: 'Call +1 617 555 0134 ext 220 for the records team.' },
  { id: 'h-pi-07', category: 'phone-international', language: 'pt-BR', value: '+351 21 555 0188',
    carrier: 'Para Portugal ligue +351 21 555 0188.' },
  { id: 'h-pi-08', category: 'phone-international', language: 'fr', value: '+32 2 555 0142',
    carrier: 'Le support belge répond au +32 2 555 0142.' },

  // =================================================== phone-national (8) ==
  { id: 'h-pn-01', category: 'phone-national', language: 'en', value: '020 7946 0958',
    carrier: 'Ring the switchboard on 020 7946 0958 and they will transfer you.' },
  { id: 'h-pn-02', category: 'phone-national', language: 'en', value: '617-555-0134',
    carrier: 'The records team is on 617-555-0134 between nine and five.' },
  { id: 'h-pn-03', category: 'phone-national', language: 'en', value: '555-0134',
    carrier: 'Dial 555-0134 to reach the front desk.' },
  { id: 'h-pn-04', category: 'phone-national', language: 'es', value: '91 555 01 88',
    carrier: 'Llama al 91 555 01 88 para pedir cita.' },
  { id: 'h-pn-05', category: 'phone-national', language: 'pt-BR', value: '(21) 3555-0199',
    carrier: 'Ligue para (21) 3555-0199 e informe o protocolo.' },
  { id: 'h-pn-06', category: 'phone-national', language: 'fr', value: '01.45.67.89.01',
    carrier: 'Composez le 01.45.67.89.01 pour joindre le standard.' },
  { id: 'h-pn-07', category: 'phone-national', language: 'fr', value: '04 78 55 01 42',
    carrier: 'Le bureau de Lyon est joignable au 04 78 55 01 42.' },
  { id: 'h-pn-08', category: 'phone-national', language: 'es', value: '600 123 456',
    carrier: 'Marca el 600 123 456 si la línea fija no responde.' },

  // ==================================================== postal-address (7) ==
  { id: 'h-pa-01', category: 'postal-address', language: 'en', value: 'P.O. Box 4471',
    carrier: 'Send the original to P.O. Box 4471 and keep a copy.' },
  { id: 'h-pa-02', category: 'postal-address', language: 'en', value: 'Suite 400, 1 Market Street',
    carrier: 'Our office is Suite 400, 1 Market Street, on the fourth floor.' },
  { id: 'h-pa-03', category: 'postal-address', language: 'en', value: '14 Ardleigh Gardens',
    carrier: 'The registered address is 14 Ardleigh Gardens.' },
  { id: 'h-pa-04', category: 'postal-address', language: 'es', value: 'Avenida de la Constitución 27',
    carrier: 'La sede está en Avenida de la Constitución 27, planta tercera.' },
  { id: 'h-pa-05', category: 'postal-address', language: 'pt-BR', value: 'Rua das Palmeiras 128',
    carrier: 'O escritório fica na Rua das Palmeiras 128, sala 12.' },
  { id: 'h-pa-06', category: 'postal-address', language: 'fr', value: '8 Boulevard Saint-Germain',
    carrier: 'Le siège est au 8 Boulevard Saint-Germain.' },
  { id: 'h-pa-07', category: 'postal-address', language: 'fr', value: 'Chemin des Vignes 42',
    carrier: 'Le dépôt se trouve au Chemin des Vignes 42.' },

  // ============================================== account-identifier (8) ==
  { id: 'h-ac-01', category: 'account-identifier', language: 'en', value: 'account #4471203',
    carrier: 'Quote account #4471203 when you call about the balance.' },
  { id: 'h-ac-02', category: 'account-identifier', language: 'en', value: 'customer ID 99887766',
    carrier: 'Your customer ID 99887766 is printed on the statement.' },
  { id: 'h-ac-03', category: 'account-identifier', language: 'en', value: 'policy number PL-5566778',
    carrier: 'The policy number PL-5566778 must appear on the claim form.' },
  { id: 'h-ac-04', category: 'account-identifier', language: 'es', value: 'nº de socio 1234567',
    carrier: 'Indica el nº de socio 1234567 al reservar la pista.' },
  { id: 'h-ac-05', category: 'account-identifier', language: 'es', value: 'expediente 2026/445566',
    carrier: 'El expediente 2026/445566 sigue abierto en la oficina.' },
  { id: 'h-ac-06', category: 'account-identifier', language: 'pt-BR', value: 'matrícula 5566778',
    carrier: 'Informe a matrícula 5566778 para consultar o histórico.' },
  { id: 'h-ac-07', category: 'account-identifier', language: 'fr', value: 'dossier n° 4455667',
    carrier: 'Le dossier n° 4455667 a été transmis au service concerné.' },
  { id: 'h-ac-08', category: 'account-identifier', language: 'fr', value: 'contrat 998877',
    carrier: 'Le contrat 998877 arrive à échéance en mars.' },

  // ==================================================== honorific-name (6) ==
  { id: 'h-hn-01', category: 'honorific-name', language: 'en', value: 'Dr. Priya Raman',
    carrier: 'Dr. Priya Raman reviewed the file last week.' },
  { id: 'h-hn-02', category: 'honorific-name', language: 'en', value: 'Ms. J. Okafor',
    carrier: 'Ms. J. Okafor is the named contact for the account.' },
  { id: 'h-hn-03', category: 'honorific-name', language: 'es', value: 'Dña. Marta Ruiz',
    carrier: 'La reclamación fue atendida por Dña. Marta Ruiz.' },
  { id: 'h-hn-04', category: 'honorific-name', language: 'pt-BR', value: 'Dra. Helena Prado',
    carrier: 'A Dra. Helena Prado assinou o parecer.' },
  { id: 'h-hn-05', category: 'honorific-name', language: 'fr', value: 'M. Julien Berger',
    carrier: 'Le dossier a été traité par M. Julien Berger.' },
  { id: 'h-hn-06', category: 'honorific-name', language: 'fr', value: 'Me. Claire Dubois',
    carrier: 'Me. Claire Dubois représente la partie demanderesse.' },

  // ============================================ labelled-contact-name (6) ==
  { id: 'h-lc-01', category: 'labelled-contact-name', language: 'en', value: 'Contact: Smith, Jane',
    carrier: 'Contact: Smith, Jane for anything relating to the account.' },
  { id: 'h-lc-02', category: 'labelled-contact-name', language: 'en', value: 'Escalation owner: Priya Raman',
    carrier: 'Escalation owner: Priya Raman, reachable on the usual number.' },
  { id: 'h-lc-03', category: 'labelled-contact-name', language: 'es', value: 'Responsable: Ana Belmonte',
    carrier: 'Responsable: Ana Belmonte para cualquier incidencia.' },
  { id: 'h-lc-04', category: 'labelled-contact-name', language: 'pt-BR', value: 'Responsável: Carla Nogueira',
    carrier: 'Responsável: Carla Nogueira pelo atendimento de segundo nível.' },
  { id: 'h-lc-05', category: 'labelled-contact-name', language: 'fr', value: 'Rédigé par Julien Berger',
    carrier: 'Rédigé par Julien Berger et validé par la direction.' },
  { id: 'h-lc-06', category: 'labelled-contact-name', language: 'fr', value: 'Contact : Claire Dubois',
    carrier: 'Contact : Claire Dubois pour les urgences.' },

  // ====================================================== national-id (5) ==
  { id: 'h-ni-01', category: 'national-id', language: 'es', value: 'DNI 12345678Z',
    carrier: 'Adjunta copia del DNI 12345678Z junto con la solicitud.' },
  { id: 'h-ni-02', category: 'national-id', language: 'es', value: 'NIF B12345678',
    carrier: 'El NIF B12345678 figura en la factura.' },
  { id: 'h-ni-03', category: 'national-id', language: 'pt-BR', value: 'CPF 123.456.789-00',
    carrier: 'Informe o CPF 123.456.789-00 no cadastro.' },
  { id: 'h-ni-04', category: 'national-id', language: 'fr', value: 'NIR 1 85 05 75 123 456 78',
    carrier: 'Le NIR 1 85 05 75 123 456 78 doit être saisi sans espaces.' },
  { id: 'h-ni-05', category: 'national-id', language: 'en', value: 'SSN 219-09-9999',
    carrier: 'Enter the SSN 219-09-9999 in the tax section of the form.' },

  // ================================================== bank-identifier (4) ==
  { id: 'h-bi-01', category: 'bank-identifier', language: 'en', value: 'IBAN GB29 NWBK 6016 1331 9268 19',
    carrier: 'Transfers must quote IBAN GB29 NWBK 6016 1331 9268 19 in full.' },
  { id: 'h-bi-02', category: 'bank-identifier', language: 'en', value: 'sort code 12-34-56',
    carrier: 'Use sort code 12-34-56 with the account below.' },
  { id: 'h-bi-03', category: 'bank-identifier', language: 'es', value: 'IBAN ES91 2100 0418 4502 0005 1332',
    carrier: 'El IBAN ES91 2100 0418 4502 0005 1332 aparece en el pie de la factura.' },
  { id: 'h-bi-04', category: 'bank-identifier', language: 'fr', value: 'RIB 30002 00550 00001234567 89',
    carrier: 'Le RIB 30002 00550 00001234567 89 est joint au contrat.' },
];

/** Categories this held-out set expects to be found, including ones the rules may not cover. */
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

export const HELDOUT_LANGUAGES = ['en', 'es', 'pt-BR', 'fr'];
