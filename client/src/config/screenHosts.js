// The public projector screen lives on our server (voting.jeinsat.com) while
// voters vote on the event server (vote.jeinsat.com, AWS).
//   - voting.jeinsat.com/qr/<key> asks for the QR code through its own /api/screen/
//     (host nginx forwards it to vote.jeinsat.com) and the QR code opens vote.jeinsat.com.
//   - The admin of vote.jeinsat.com sees the link on voting.jeinsat.com.
// Any other host (test copies) does everything on itself.
const VOTE_SITE_FOR = { "voting.jeinsat.com": "https://vote.jeinsat.com" };
const SCREEN_SITE_FOR = { "vote.jeinsat.com": "https://voting.jeinsat.com" };

export const voteSiteOrigin = () => VOTE_SITE_FOR[window.location.host] || window.location.origin;
export const screenSiteOrigin = () => SCREEN_SITE_FOR[window.location.host] || window.location.origin;
export const screenLink = (key) => `${screenSiteOrigin()}/qr/${key}`;
