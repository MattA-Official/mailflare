# Security notes for inbound mail

## Deleted attachments stay in the original message

Deleting an attachment removes its stored file and its row, so it can no longer be
downloaded, previewed or shared. The message's original MIME (`rawR2Key`) is a faithful
copy of what arrived and is not rewritten, so **Download original** and the JMAP raw
blob still contain the attachment bytes. Delete the whole message to remove the original.

Public shared-file links stop working as soon as the message is moved to trash or spam
or its mailbox is disabled; they also expire on their own.

## Authentication results

SPF, DKIM and DMARC come from the `Authentication-Results` header Cloudflare Email Routing
writes (authserv-id `mx.cloudflare.net`). A failure in any such clause wins over a pass.
Sender-written `Authentication-Results`, `Received-SPF` and `Received` headers are never
trusted.

## Webhooks

Webhook URLs must be `https://` on a public host. Redirects are not followed, and hooks
saved before this rule are re-checked at delivery. Mail filed as spam or trash does not
trigger `message.inbound`.

## Forwarding loop guard

Mail Mailflare forwards carries `X-Mailflare-Forwarded`, an HMAC keyed with a server secret
(`CF_TOKEN` or `CF_API_KEY`). A sender cannot switch forwarding
off by adding the header. With none of those set the header falls back to `1`.

## Attachments

Mailflare does not run an antivirus engine. What it does instead:

* Every attachment is judged from its name and type: programs and scripts, macro-enabled
  Office files, double extensions such as `invoice.pdf.exe`, hidden bidi characters, and
  containers that hide other files (HTML, SVG, disk images, archives).
* ZIP files are inspected without extracting anything: the file names in the central
  directory are read with two bounded range requests (at most 1000 entries and 1 MiB of
  directory). Password-protected or unreadable archives are flagged.
* A flagged attachment shows the reasons in the viewer, and the download stays disabled
  until the user ticks "I understand the risk". The server refuses an unacknowledged
  download of a flagged file with HTTP 409, so a direct link cannot bypass it.

This stops one-click downloads of things that are dangerous by design. It does not find
malware in an ordinary-looking PDF or image; Mailflare has no hook for an
external scanner.
