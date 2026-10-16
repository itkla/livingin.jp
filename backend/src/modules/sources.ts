import { CalendarDate, id, Instant, ReviewState } from '../contract/common';
import { defineOperation } from '../contract/operation';
import { z } from '../contract/zod';

export const SourceRecord = z
  .object({
    id: id('source'),
    title: z.string(),
    publisher: z.string(),
    authority: z.enum(['official', 'provider', 'community', 'editorial']),
    url: z.url().nullable(),
    retrieved_at: Instant,
    published_on: CalendarDate.nullable().openapi({ description: 'Publication or effective date stated by the source, if any.' }),
    revision_label: z.string().nullable().openapi({ description: 'The source’s own version label, e.g. a fiscal-year edition.' }),
    rights: z
      .discriminatedUnion('status', [
        z.object({ status: z.literal('permitted'), basis: z.enum(['open_license', 'agreement', 'public_domain', 'facts_only']), license: z.string().nullable(), attribution_text: z.string().nullable() }),
        z.object({ status: z.literal('link_only') }),
        z.object({ status: z.literal('under_review') }),
      ])
      .openapi({ description: 'Whether livingin.jp may reuse the content. `link_only`: we cite and link but do not reproduce. Official identity and reuse permission are different questions.' }),
    review: ReviewState,
    superseded_by: id('source').nullable(),
  })
  .openapi('SourceRecord', { description: 'Provenance, rights and review for information livingin.jp maintains or derives.' });

export const sourcesOperations = [
  defineOperation({
    operationId: 'getSource',
    module: 'sources',
    feature: 'sources.registry',
    method: 'get',
    path: '/v1/sources/{source_id}',
    summary: 'Source record',
    auth: 'none',
    request: { params: z.object({ source_id: id('source') }) },
    responses: { 200: { description: 'A source record.', schema: SourceRecord } },
    requiredScenarios: ['superseded', 'not_found'],
  }),
];
