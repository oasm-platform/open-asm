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
 * @module aws-sigv4
 *
 * Vendored, trimmed copy of the AWS Signature Version 4 implementation from
 * nginxinc/nginx-s3-gateway (Apache-2.0):
 *   common/etc/nginx/include/awssig4.js
 *   common/etc/nginx/include/utils.js
 *   https://github.com/nginxinc/nginx-s3-gateway
 *
 * The signature algorithm is unchanged: the canonical request, the string to
 * sign, the signing-key derivation, the Authorization header format, and the
 * signed-header list `host;x-amz-content-sha256;x-amz-date` all match upstream.
 * Trimmed for the static-credential, proxied-GET path only: AWS session tokens,
 * the signing-key byte cache, and the debug fingerprint/redaction helpers are
 * removed. See console/nginx/NOTICE for attribution.
 */

const crypto = require('crypto');

/**
 * Headers signed by every request. Kept byte-identical to upstream so the
 * canonical request matches what RustFS recomputes from the proxied headers.
 * @type {string}
 */
const DEFAULT_SIGNED_HEADERS = 'host;x-amz-content-sha256;x-amz-date';

/**
 * Pads the supplied number with leading zeros.
 * @param num {number|string} number to pad
 * @param size {number} number of leading zeros to pad
 * @returns {string} a string with leading zeros
 */
function padWithLeadingZeros(num, size) {
    const s = '0' + num;
    return s.substr(s.length - size);
}

/**
 * Formats a timestamp into a date string in the format 'YYYYMMDD'.
 * @param timestamp {Date} timestamp
 * @returns {string} a formatted date string based on the input timestamp
 */
function getEightDigitDate(timestamp) {
    return ''.concat(
        padWithLeadingZeros(timestamp.getUTCFullYear(), 4),
        padWithLeadingZeros(timestamp.getUTCMonth() + 1, 2),
        padWithLeadingZeros(timestamp.getUTCDate(), 2));
}

/**
 * Creates a string in the ISO8601 date format (YYYYMMDD'T'HHMMSS'Z') based on
 * the supplied timestamp and date.
 * @param timestamp {Date} timestamp to extract the time from
 * @param eightDigitDate {string} 'YYYYMMDD' date string already extracted from timestamp
 * @returns {string} string in the format of YYYYMMDD'T'HHMMSS'Z'
 */
function getAmzDatetime(timestamp, eightDigitDate) {
    return ''.concat(
        eightDigitDate,
        'T', padWithLeadingZeros(timestamp.getUTCHours(), 2),
        padWithLeadingZeros(timestamp.getUTCMinutes(), 2),
        padWithLeadingZeros(timestamp.getUTCSeconds(), 2),
        'Z');
}

/**
 * SHA-256 hex digest of a value.
 * @param value {NjsStringOrBuffer} value to hash
 * @returns {string} hex digest
 */
function hashSha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Return the x-amz-content-sha256 value for the request body (empty for GET).
 * @param r {NginxHTTPRequest} HTTP request object
 * @returns {string} payload hash
 */
function awsHeaderPayloadHash(r) {
    const reqBody = r.variables.request_body ? r.variables.request_body : '';
    return hashSha256(reqBody);
}

/**
 * Creates a canonical request that will later be signed.
 * @see https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html
 * @param method {string} HTTP method
 * @param uri {string} URI associated with request
 * @param queryParams {string} query parameters associated with request
 * @param host {string} HTTP host header value
 * @param amzDatetime {string} ISO8601 timestamp string to sign request with
 * @param contentHash {string} hex SHA-256 hash of the request body
 * @returns {string} string with concatenated request parameters
 */
function _buildCanonicalRequest(method, uri, queryParams, host, amzDatetime, contentHash) {
    let canonicalHeaders = 'host:' + host + '\n' +
                           'x-amz-content-sha256:' + contentHash + '\n' +
                           'x-amz-date:' + amzDatetime + '\n';

    let canonicalRequest = method + '\n';
    canonicalRequest += uri + '\n';
    canonicalRequest += queryParams + '\n';
    canonicalRequest += canonicalHeaders + '\n';
    canonicalRequest += DEFAULT_SIGNED_HEADERS + '\n';
    canonicalRequest += contentHash;
    return canonicalRequest;
}

/**
 * Creates a string to sign by concatenating the parameters required by the
 * Signature Version 4 algorithm.
 * @see https://docs.aws.amazon.com/general/latest/gr/sigv4-create-string-to-sign.html
 * @param amzDatetime {string} ISO8601 timestamp string to sign request with
 * @param eightDigitDate {string} date in the form of 'YYYYMMDD'
 * @param region {string} region associated with server API
 * @param service {string} service code (for example, s3, lambda)
 * @param canonicalRequestHash {string} hex encoded hash of canonical request string
 * @returns {string} string formatted for signatures
 */
function _buildStringToSign(amzDatetime, eightDigitDate, region, service, canonicalRequestHash) {
    return 'AWS4-HMAC-SHA256\n' +
        amzDatetime + '\n' +
        eightDigitDate + '/' + region + '/' + service + '/aws4_request\n' +
        canonicalRequestHash;
}

/**
 * Derives the SigV4 signing key (HMAC chain) for a secret and scope.
 * @param kSecret {string} secret access key
 * @param eightDigitDate {string} date in the form of 'YYYYMMDD'
 * @param region {string} region associated with server API
 * @param service {string} service code (for example, s3)
 * @returns {ArrayBuffer} signing HMAC
 */
function _buildSigningKeyHash(kSecret, eightDigitDate, region, service) {
    const kDate = crypto.createHmac('sha256', 'AWS4'.concat(kSecret))
        .update(eightDigitDate).digest();
    const kRegion = crypto.createHmac('sha256', kDate)
        .update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion)
        .update(service).digest();
    return crypto.createHmac('sha256', kService)
        .update('aws4_request').digest();
}

/**
 * Create the HTTP Authorization header for authenticating against an AWS
 * compatible v4 API.
 *
 * @param r {NginxHTTPRequest} HTTP request object
 * @param timestamp {Date} timestamp associated with request; the caller must
 *        pass the same value used to build the x-amz-date header so the
 *        signature and the header never straddle a second boundary
 * @param region {string} API region associated with request
 * @param service {string} service code (for example, s3)
 * @param uri {string} URI-encoded absolute path component of the request
 * @param queryParams {string} URL-encoded query string ('' when none)
 * @param host {string} HTTP host header value (hostname[:port])
 * @param credentials {Object} Credential object (accessKeyId, secretAccessKey)
 * @returns {string} HTTP Authorization header value
 */
function signatureV4(r, timestamp, region, service, uri, queryParams, host, credentials) {
    const eightDigitDate = getEightDigitDate(timestamp);
    const amzDatetime = getAmzDatetime(timestamp, eightDigitDate);
    const contentHash = awsHeaderPayloadHash(r);
    const canonicalRequest = _buildCanonicalRequest(
        r.method, uri, queryParams, host, amzDatetime, contentHash);
    const canonicalRequestHash = hashSha256(canonicalRequest);
    const stringToSign = _buildStringToSign(
        amzDatetime, eightDigitDate, region, service, canonicalRequestHash);
    const kSigningHash = _buildSigningKeyHash(
        credentials.secretAccessKey, eightDigitDate, region, service);
    const signature = crypto.createHmac('sha256', kSigningHash)
        .update(stringToSign).digest('hex');

    return 'AWS4-HMAC-SHA256 Credential=' +
        credentials.accessKeyId + '/' + eightDigitDate + '/' + region + '/' + service + '/aws4_request,' +
        'SignedHeaders=' + DEFAULT_SIGNED_HEADERS + ',Signature=' + signature;
}

export default {
    signatureV4,
    awsHeaderPayloadHash,
    getEightDigitDate,
    getAmzDatetime,
    DEFAULT_SIGNED_HEADERS
};
