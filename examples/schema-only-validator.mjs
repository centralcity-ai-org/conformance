// The smallest possible validator: the published JSON Schemas only. Run it with
//   cc-conformance validator examples/schema-only-validator.mjs --schema-only
// A real implementation also rejects the "semantic" cases (rules in each schema's $comment),
// so it runs without --schema-only.
import { schemaValidator } from '../src/run.mjs';

const validate = schemaValidator();
export default ({ schema, document }) => validate({ schema, document });
