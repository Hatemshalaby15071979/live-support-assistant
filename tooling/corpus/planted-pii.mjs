/**
 * Planted personal data, for measuring the privacy gate's recall.
 *
 * Every string here is fabricated. The domains are invented, the numbers are
 * made up, and the names are not people. Nothing in this file is real data and
 * nothing in it should be copied into a corpus.
 *
 * The set exists because the quarantine-rate change relaxes a *rate*, and
 * relaxing a rate is exactly the kind of change that quietly reduces detection.
 * Measuring recall directly, separately from the rate, is what makes the
 * relaxation safe to make: if detection moved, this number says so.
 *
 * Spread across the categories the gate claims, and across the four languages
 * the corpus actually carries. A gate that works in English and fails in
 * Portuguese would pass an English-only test and quarantine nothing in
 * `k8s-tasks-pt-br` — which is 69 documents of the 345.
 */

/**
 * @typedef {object} PlantedString
 * @property {string} id
 * @property {'email'|'phone-international'|'phone-national'|'postal-address'|'account-identifier'|'honorific-name'|'labelled-contact-name'|'national-insurance-or-ssn-shaped'} category
 *   The pattern the gate is expected to fire.
 * @property {'en'|'es'|'pt'|'fr'} language
 * @property {string} value The planted string itself.
 * @property {string} carrier A sentence the value sits in, in the same language.
 *   Prose matters: a bare string is a pattern-matching exercise, and the gate has
 *   to work on documents.
 */

/** @type {readonly PlantedString[]} */
export const PLANTED = [
  // ---------------------------------------------------------------- email --
  { id: 'em-en-1', category: 'email', language: 'en', value: 'maria.lindqvist@northgate-helpdesk.co.uk',
    carrier: 'If the export fails again, write to maria.lindqvist@northgate-helpdesk.co.uk and include the job id.' },
  { id: 'em-en-2', category: 'email', language: 'en', value: 'j.okafor+escalations@brightpath-support.com',
    carrier: 'Escalations go to j.okafor+escalations@brightpath-support.com within one business day.' },
  { id: 'em-es-1', category: 'email', language: 'es', value: 'soporte.tecnico@asistencia-iberica.es',
    carrier: 'Para incidencias de facturación, escribe a soporte.tecnico@asistencia-iberica.es indicando el número de pedido.' },
  { id: 'em-pt-1', category: 'email', language: 'pt', value: 'atendimento.nivel2@suporte-atlantico.com.br',
    carrier: 'Caso o problema continue, envie os detalhes para atendimento.nivel2@suporte-atlantico.com.br.' },
  { id: 'em-fr-1', category: 'email', language: 'fr', value: 'assistance.client@support-loire.fr',
    carrier: "Pour toute réclamation, adressez le dossier à assistance.client@support-loire.fr en précisant la référence." },
  { id: 'em-en-3', category: 'email', language: 'en', value: 'data.protection@meridian-retail-group.com',
    carrier: 'Requests about stored records go to data.protection@meridian-retail-group.com.' },

  // --------------------------------------------------- phone, international --
  { id: 'pi-en-1', category: 'phone-international', language: 'en', value: '+44 20 7946 0812',
    carrier: 'Call +44 20 7946 0812 between 08:00 and 18:00 and quote the case number.' },
  { id: 'pi-en-2', category: 'phone-international', language: 'en', value: '+1 (415) 555-0147',
    carrier: 'The after-hours line is +1 (415) 555-0147.' },
  { id: 'pi-es-1', category: 'phone-international', language: 'es', value: '+34 912 345 678',
    carrier: 'Puedes llamar al +34 912 345 678 de lunes a viernes.' },
  { id: 'pi-pt-1', category: 'phone-international', language: 'pt', value: '+55 11 98765-4321',
    carrier: 'O suporte telefônico atende no +55 11 98765-4321 em horário comercial.' },
  { id: 'pi-fr-1', category: 'phone-international', language: 'fr', value: '+33 1 45 67 89 01',
    carrier: 'Le numéro du support est le +33 1 45 67 89 01.' },
  { id: 'pi-en-3', category: 'phone-international', language: 'en', value: '+61 2 5550 1234',
    carrier: 'For the Sydney office, dial +61 2 5550 1234.' },

  // -------------------------------------------------------- phone, national --
  { id: 'pn-en-1', category: 'phone-national', language: 'en', value: '(555) 123-4567',
    carrier: 'Ring (555) 123-4567 to confirm the appointment.' },
  { id: 'pn-en-2', category: 'phone-national', language: 'en', value: '555.987.6543',
    carrier: 'Our billing line is 555.987.6543.' },
  { id: 'pn-en-3', category: 'phone-national', language: 'en', value: '415-555-0199',
    carrier: 'Report outages to 415-555-0199 at any hour.' },
  { id: 'pn-es-1', category: 'phone-national', language: 'es', value: '912 345 678',
    carrier: 'Llama al 912 345 678 para cambiar la cita.' },
  { id: 'pn-fr-1', category: 'phone-national', language: 'fr', value: '01 45 67 89 01',
    carrier: 'Appelez le 01 45 67 89 01 pour toute question.' },

  // ------------------------------------------------------- postal address --
  { id: 'pa-en-1', category: 'postal-address', language: 'en', value: '221B Baker Street',
    carrier: 'Send the signed form to 221B Baker Street and keep the receipt.' },
  { id: 'pa-en-2', category: 'postal-address', language: 'en', value: '48 Fenchurch Avenue',
    carrier: 'The registered office is 48 Fenchurch Avenue.' },
  { id: 'pa-en-3', category: 'postal-address', language: 'en', value: '12 Elm Road',
    carrier: 'Returns go to 12 Elm Road, not to the depot.' },
  { id: 'pa-es-1', category: 'postal-address', language: 'es', value: 'Calle Mayor 45',
    carrier: 'La oficina central está en Calle Mayor 45.' },
  { id: 'pa-fr-1', category: 'postal-address', language: 'fr', value: '17 Rue de la Paix',
    carrier: 'Le courrier doit être envoyé au 17 Rue de la Paix.' },

  // --------------------------------------------------- account identifier --
  { id: 'ac-en-1', category: 'account-identifier', language: 'en', value: 'account id: AC-12345678',
    carrier: 'The account id: AC-12345678 was suspended pending review.' },
  { id: 'ac-en-2', category: 'account-identifier', language: 'en', value: 'case #99887766',
    carrier: 'See case #99887766 for the full history.' },
  { id: 'ac-en-3', category: 'account-identifier', language: 'en', value: 'invoice number INV-4471203',
    carrier: 'Quote invoice number INV-4471203 when you call.' },
  { id: 'ac-es-1', category: 'account-identifier', language: 'es', value: 'referencia de pedido: 55667788',
    carrier: 'Indica la referencia de pedido: 55667788 en el formulario.' },
  { id: 'ac-pt-1', category: 'account-identifier', language: 'pt', value: 'número do caso: 12345678',
    carrier: 'Informe o número do caso: 12345678 ao abrir o chamado.' },
  { id: 'ac-fr-1', category: 'account-identifier', language: 'fr', value: 'référence client: 87654321',
    carrier: 'Indiquez la référence client: 87654321 dans votre demande.' },

  // ------------------------------------------------------ honorific name --
  { id: 'hn-en-1', category: 'honorific-name', language: 'en', value: 'Dr Amina Farouk',
    carrier: 'Reviewed by Dr Amina Farouk on the fourteenth.' },
  { id: 'hn-en-2', category: 'honorific-name', language: 'en', value: 'Mr Tobias Lindgren',
    carrier: 'Mr Tobias Lindgren signed the approval.' },
  { id: 'hn-es-1', category: 'honorific-name', language: 'es', value: 'Sra Elena Vargas',
    carrier: 'La solicitud fue aprobada por la Sra Elena Vargas.' },
  { id: 'hn-pt-1', category: 'honorific-name', language: 'pt', value: 'Sr Rafael Menezes',
    carrier: 'O pedido foi revisado pelo Sr Rafael Menezes.' },
  { id: 'hn-fr-1', category: 'honorific-name', language: 'fr', value: 'Mme Claire Dubois',
    carrier: 'Le dossier a été validé par Mme Claire Dubois.' },
  { id: 'hn-en-3', category: 'honorific-name', language: 'en', value: 'Prof Daniel Osei',
    carrier: 'Prof Daniel Osei chairs the review panel.' },

  // -------------------------------------------------- labelled contact name --
  { id: 'lc-en-1', category: 'labelled-contact-name', language: 'en', value: 'Contact: Jane Smith',
    carrier: 'Contact: Jane Smith for escalation.' },
  { id: 'lc-en-2', category: 'labelled-contact-name', language: 'en', value: 'Written by Peter Novak',
    carrier: 'Written by Peter Novak and reviewed quarterly.' },
  { id: 'lc-en-3', category: 'labelled-contact-name', language: 'en', value: 'Author: Grace Adeyemi',
    carrier: 'Author: Grace Adeyemi, last revised in March.' },
  { id: 'lc-es-1', category: 'labelled-contact-name', language: 'es', value: 'Contacto: Laura Jimenez',
    carrier: 'Contacto: Laura Jimenez para escalados.' },
  { id: 'lc-pt-1', category: 'labelled-contact-name', language: 'pt', value: 'Contato: Bruno Almeida',
    carrier: 'Contato: Bruno Almeida para escalonamentos.' },
  { id: 'lc-fr-1', category: 'labelled-contact-name', language: 'fr', value: 'Contact : Sophie Martin',
    carrier: 'Contact : Sophie Martin pour les escalades.' },

  // ------------------------------------------------------------ ssn-shaped --
  { id: 'ss-en-1', category: 'national-insurance-or-ssn-shaped', language: 'en', value: '123-45-6789',
    carrier: 'The form asks for 123-45-6789 in section two.' },
  { id: 'ss-en-2', category: 'national-insurance-or-ssn-shaped', language: 'en', value: 'AB 12 34 56 C',
    carrier: 'Record the national insurance number as AB 12 34 56 C.' },
  { id: 'ss-en-3', category: 'national-insurance-or-ssn-shaped', language: 'en', value: '987-65-4321',
    carrier: 'Do not email 987-65-4321 to anyone outside the team.' },
  { id: 'ss-en-4', category: 'national-insurance-or-ssn-shaped', language: 'en', value: 'QQ 98 76 54 B',
    carrier: 'The payroll export lists QQ 98 76 54 B in the identifier column.' },
];

/** Every category the gate claims to detect. Used to assert the set covers them. */
export const REQUIRED_CATEGORIES = [
  'email',
  'phone-international',
  'phone-national',
  'postal-address',
  'account-identifier',
  'honorific-name',
  'labelled-contact-name',
  'national-insurance-or-ssn-shaped',
];

/** Every language the corpus carries. */
export const REQUIRED_LANGUAGES = ['en', 'es', 'pt', 'fr'];
