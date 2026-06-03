/**
 * Reply-To campaign tagging.
 *
 * Encodes campaign/project/client context into a +subaddress tag on outbound
 * emails so that inbound replies can be routed back to the right campaign.
 *
 * Format:  reply+{base64url(JSON)}@{inboundDomain}
 * Example: reply+eyJ1aWQiOiI...@mail.sparks.agency
 */

export interface ReplyContext {
    uid: string;   // user / owner ID (required)
    cid?: string;  // campaign ID
    pid?: string;  // project ID
    lid?: string;  // client ID
    aid?: string;  // email_account ID (so we know which "from" to use when replying)
}

/**
 * Encode context into a compact base64url string.
 * Only non-undefined fields are included to keep the tag short.
 */
export function encodeReplyTag(ctx: ReplyContext): string {
    const compact: Record<string, string> = { uid: ctx.uid };
    if (ctx.cid) compact.cid = ctx.cid;
    if (ctx.pid) compact.pid = ctx.pid;
    if (ctx.lid) compact.lid = ctx.lid;
    if (ctx.aid) compact.aid = ctx.aid;

    return Buffer.from(JSON.stringify(compact)).toString('base64url');
}

/**
 * Build the full Reply-To address.
 *
 * @param ctx          - Context to encode
 * @param inboundDomain - e.g. "mail.sparks.agency"
 * @returns e.g. "reply+eyJ1aWQiOiI...@mail.sparks.agency"
 */
export function buildReplyToAddress(ctx: ReplyContext, inboundDomain: string): string {
    return `reply+${encodeReplyTag(ctx)}@${inboundDomain}`;
}

/**
 * Decode the reply context from a full address or just a local-part.
 *
 * Accepts:
 *   "reply+eyJ1aWQiOiI...@mail.sparks.agency"
 *   "reply+eyJ1aWQiOiI..."
 *
 * Returns null if the address is not a valid reply-routing address or the
 * payload cannot be parsed.
 */
export function decodeReplyTag(address: string): ReplyContext | null {
    try {
        // Strip the domain part if present
        const localPart = address.split('@')[0];
        const plusIdx = localPart.indexOf('+');
        if (plusIdx === -1) return null;

        const tag = localPart.slice(plusIdx + 1);
        if (!tag) return null;

        const json = Buffer.from(tag, 'base64url').toString('utf-8');
        const parsed = JSON.parse(json);

        // uid is the only required field
        if (typeof parsed.uid !== 'string' || !parsed.uid) return null;

        return {
            uid: parsed.uid,
            cid: typeof parsed.cid === 'string' ? parsed.cid : undefined,
            pid: typeof parsed.pid === 'string' ? parsed.pid : undefined,
            lid: typeof parsed.lid === 'string' ? parsed.lid : undefined,
            aid: typeof parsed.aid === 'string' ? parsed.aid : undefined,
        };
    } catch {
        return null;
    }
}

/**
 * Returns true if the address looks like one of our reply-routing addresses
 * (i.e. the local part starts with "reply+" and the domain matches).
 */
export function isReplyRoutingAddress(address: string, inboundDomain: string): boolean {
    const lower = address.toLowerCase();
    return lower.startsWith('reply+') && lower.includes(`@${inboundDomain.toLowerCase()}`);
}
