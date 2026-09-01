/**
 * React component that renders a JSON-LD <script> block.
 *
 * The data builders live in `lib/structured-data.ts` (a pure
 * module that's easy to unit-test). This component is the
 * thin React wrapper that drops the result into the DOM.
 *
 * Server components import the builders and emit the script
 * directly. Client components - the PDP is the only one that
 * publishes structured data - can either use this component
 * (if they're already a React tree) or inline the <script>
 * with a `dangerouslySetInnerHTML`.
 */
import type { ReactElement } from 'react';
import { asGraph, type JsonLdObject } from '@/lib/structured-data';

export interface JsonLdScriptProps {
  data: JsonLdObject | JsonLdObject[];
  /**
   * data-testid applied to the script element. Defaults to
   * 'json-ld' so component tests can assert the script is
   * present without inspecting `dangerouslySetInnerHTML`.
   */
  testId?: string;
}

export function JsonLdScript({ data, testId = 'json-ld' }: JsonLdScriptProps): ReactElement {
  const payload = Array.isArray(data) ? asGraph(data) : data;
  return (
    <script
      type="application/ld+json"
      data-testid={testId}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}
