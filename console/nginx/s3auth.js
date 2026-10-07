/*
 *  Copyright 2023 F5, Inc.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @module s3auth
 *
 * nginx njs bridge between the console's `/files/` reads and the private
 * RustFS bucket. It provides the `js_set` variables consumed by the main
 * nginx.conf and (in a later todo) the `/files/` location:
 *
 *   $files_bucket  - bucket parsed from the request URI ('' when malformed)
 *   $files_key     - key parsed from the request URI    ('' when malformed)
 *   $awsDate       - x-amz-date value (YYYYMMDD'T'HHMMSS'Z')
 *   $awsPayloadHash- x-amz-content-sha256 value (hash of the empty GET body)
 *   $s3auth        - SigV4 Authorization header ('' when unsigned/malformed)
 *
 * Bucket and key are derived from $request_uri rather than $uri: an
 * auth_request subrequest has its own $uri (/_files_auth) but inherits
 * $request_uri from the client request, so only the latter yields the real
 * object path inside the auth subrequest.
 *
 * Signing credentials come from RUSTFS_ACCESS_KEY / RUSTFS_SECRET_KEY and are
 * preserved with `env` directives in the main nginx.conf; S3_REGION defaults to
 * us-east-1.
 */

import awssig4 from './aws-sigv4.js';

/** Only these characters may appear in a bucket or key segment. */
const SAFE_SEGMENT = /^[0-9A-Za-z._-]+$/;

/** Path prefix reserved for direct object reads. */
const FILES_PREFIX = '/files/';

/** SIGV4 host the request is proxied to; signed for exactly this value. */
const STORAGE_HOST = 'rustfs:9000';

/** SigV4 service code for object storage. */
const STORAGE_SERVICE = 's3';

/** SHA-256 of the empty body, the payload hash for every GET. */
const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/**
 * Signing credentials from the process environment.
 * @returns {{accessKeyId: string, secretAccessKey: string, sessionToken: null}}
 */
function credentials() {
    return {
        accessKeyId: process.env.RUSTFS_ACCESS_KEY,
        secretAccessKey: process.env.RUSTFS_SECRET_KEY,
        sessionToken: null
    };
}

/**
 * @returns {string} SigV4 region for the object storage service
 */
function region() {
    return process.env.S3_REGION || 'us-east-1';
}

/**
 * Memoizes ONE timestamp per request in a js_var so that $awsDate (the header
 * sent upstream) and $s3auth (the signature) always agree, regardless of the
 * order nginx evaluates the two variables. Without this a second-boundary
 * crossing between the two evaluations produces intermittent
 * SignatureDoesNotMatch.
 *
 * @param r {NginxHTTPRequest} HTTP request object
 * @returns {Date} the request's single signing timestamp
 */
function requestTimestamp(r) {
    if (!r.variables.s3_request_time) {
        r.variables.s3_request_time = String(Date.now());
    }
    return new Date(Number(r.variables.s3_request_time));
}

/**
 * Rejects empty input, dot segments, and any character outside the safe set
 * (this also covers NUL, CR, and LF, which are not in the class).
 * @param segment {string} a single path segment
 * @returns {boolean} true when the segment is a safe, non-empty, non-dot value
 */
function isSafeSegment(segment) {
    return segment !== '' && segment !== '.' && segment !== '..' &&
        SAFE_SEGMENT.test(segment);
}

/**
 * Validates a full object key: every slash-separated segment must be safe.
 * @param key {string} object key
 * @returns {boolean} true when the key is safe
 */
function isSafeKey(key) {
    const segments = key.split('/');
    for (let i = 0; i < segments.length; i++) {
        if (!isSafeSegment(segments[i])) {
            return false;
        }
    }
    return true;
}

/**
 * Parses `<bucket>/<key>` from the request URI. The query string is stripped
 * and the path is percent-decoded inside a try/catch so a malformed escape
 * (`%`, `%zz`) is rejected instead of throwing. Returns null for any request
 * that is not a well-formed `/files/<bucket>/<key>`.
 *
 * @param r {NginxHTTPRequest} HTTP request object
 * @returns {{bucket: string, key: string}|null} parsed target or null
 */
function parseTarget(r) {
    const raw = r.variables.request_uri || '';
    const path = raw.split('?')[0];
    if (path.indexOf(FILES_PREFIX) !== 0) {
        return null;
    }

    let decoded;
    try {
        decoded = decodeURIComponent(path);
    } catch (e) {
        return null;
    }

    const rest = decoded.slice(FILES_PREFIX.length);
    const slash = rest.indexOf('/');
    if (slash <= 0 || slash === rest.length - 1) {
        return null;
    }

    const bucket = rest.slice(0, slash);
    const key = rest.slice(slash + 1);
    if (!isSafeSegment(bucket) || !isSafeKey(key)) {
        return null;
    }

    return { bucket: bucket, key: key };
}

/**
 * @param r {NginxHTTPRequest} HTTP request object
 * @returns {string} bucket name, or '' when the request is malformed
 */
function filesBucket(r) {
    const target = parseTarget(r);
    return target ? target.bucket : '';
}

/**
 * @param r {NginxHTTPRequest} HTTP request object
 * @returns {string} object key, or '' when the request is malformed
 */
function filesKey(r) {
    const target = parseTarget(r);
    return target ? target.key : '';
}

/**
 * @param r {NginxHTTPRequest} HTTP request object
 * @returns {string} x-amz-date value for this request
 */
function awsDate(r) {
    const timestamp = requestTimestamp(r);
    return awssig4.getAmzDatetime(timestamp, awssig4.getEightDigitDate(timestamp));
}

/**
 * @param _r {NginxHTTPRequest} HTTP request object (unused: GET has no body)
 * @returns {string} x-amz-content-sha256 value for the empty GET body
 */
function awsPayloadHash(_r) {
    return EMPTY_BODY_SHA256;
}

/**
 * Builds the SigV4 Authorization header for a direct read, signing exactly the
 * date $awsDate sends and the `/bucket/key` path proxied upstream. Returns ''
 * when the target is malformed or the credentials are absent so the location
 * guard rejects the request instead of forwarding it unsigned.
 *
 * @param r {NginxHTTPRequest} HTTP request object
 * @returns {string} Authorization header value, or ''
 */
function s3auth(r) {
    const target = parseTarget(r);
    if (!target) {
        return '';
    }

    const creds = credentials();
    if (!creds.accessKeyId || !creds.secretAccessKey) {
        return '';
    }

    const timestamp = requestTimestamp(r);
    const uri = '/' + target.bucket + '/' + target.key;
    return awssig4.signatureV4(
        r, timestamp, region(), STORAGE_SERVICE, uri, '', STORAGE_HOST, creds);
}

export default {
    filesBucket,
    filesKey,
    awsDate,
    awsPayloadHash,
    s3auth,
    // Exposed for the test harness / future location wiring.
    parseTarget
};
