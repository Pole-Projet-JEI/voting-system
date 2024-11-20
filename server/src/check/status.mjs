import { Router } from "express";
const route = Router();
const oldCodes = [
    'W01LG', '6HVZ0', 'RQSBT', 'R40Z9', '8K5ZD', '8LBYR', 'ZA5IC', '3XO3F',
    'LLO8J', 'GHNJJ', 'KAKN2', 'MGRN6', '3JV3N', 'BSNZ8', 'DV4YJ', 'PZRA4',
    '82A7W', 'FR99X', '13XCR', 'P2ZN9', 'EY6AP', 'D5KGS', 'EAKF7', 'O51AA',
    'BRU0T', 'GP1RE', 'EW3N2', '27HZK', 'CK58G', 'TDPVX', 'SHM64', '7KW4L',
    'E0XDI', 'R5SN5', 'E667D', '5WI1F', 'PQRJN', 'BLAFH', 'A6DE1', 'ATC9I',
    '40IPR', 'MKLEV', 'FBAZB', 'RC5DW', 'VS24N', 'B9R74', '5AXR1', '9HP0D',
    'E3SJJ', 'VMR4N', 'X2T12', 'DFFG3', 'IO019', 'XWA7R', 'QI2X3', 'VZPEN',
    'SU63T', 'IL8QE', 'HT0OT', '7460U', 'MN0JT', 'SHZY9', 'ND34T', '4GQJN',
    '95BVV', 'OZHC7', 'N8V73', 'RTJBQ', 'ZAM4M', '8V9BE', 'RLOQ6', 'RSMOM',
    '92050', 'WESPC', 'LD07I', 'EUGD5', '31SU3', 'ZW7EY', '6OLJX', '4Q1SP',
    'SEP0J', 'KRBXV', 'H6FTU', 'TGJA6', 'CTOLP', 'KEBOV', '99W4M', 'SK9FE',
    '43JNZ', '5JUJT', 'KT62G', '1I990', '2HW9X', '6E43Q', 'VSRFZ', 'BGE0W',
    '8OP0T', 'N5V39', 'C9H53', 'GS6PW', 'SUOBZ', 'RDD4H', 'I0BCQ', 'XO5GE',
    '052F9', 'E0EJA', 'LTIBS', '0OR8M', 'U2F42', '0KA3R', 'WUA1S', 'MPR0Q',
    '5PPMN', 'DQ4NR', 'KD9KS', '0UIEC', '9CDY0', 'XPGTZ', 'RVHY9', '4BK46',
    'Q9XNY', 'US1QV', 'G4U4R', 'XVOV3', 'GSYQ5', 'PN5BA', '09MDS', '9KEDY',
    'RWQIS', 'Z2PIJ', '0NZ7L', 'TOPIN', 'JUCK9', 'G5IMG', 'OQY08', 'SBU50',
    'PZ8AW', 'GNOOX', 'UI5F0', 'AVFSO', 'Y68Z2', 'Q0CS8', 'OKOZR', 'C4AWR',
    'IPLLX', 'JZVET', '7KDGW', 'QXHF1', 'NDZGR', 'L9LM3', 'ERRCK', 'CN1BZ',
    '8ZQWE', 'SDQGW', '4HXYF', 'E1MQN', 'I11L8', '6JTF8', 'SQG44', '8ULQC',
    'FIJ1L', 'FUSVW', 'ZTBTD', 'QLYV6', 'VSUZJ', '2XNE0', 'O5Y2A', 'A1VH3',
    'B8R3M', '8S503', 'N6J7P', '61RTA', '7A2T6', 'HZOHW', 'LZWR7', 'FCK2Q',
    'MH03Z', 'TN4LQ', 'NQBR8', '43UXM', 'MUK4X', 'WRFIR', '9FAAZ', 'YQNKE',
    'HR27A', 'TSVDZ', 'CGQZK', '0GYXS', '3R1HB', 'WRD2U', 'W19HD', 'DCYJX',
    '39FTP', 'YN0X3', 'LBH2O', 'GIADD', '0WRHY', 'ES2RS', 'BG9FT', 'NPJVS',
    'MVG5J', '5C0VV', 'RHUO2', '1RHHB', 'YIQXK', 'WMN2X', '493DK', 'PW4AG',
    '76D2B', 'C46AE', 'ABUAD', 'QL8H9', 'ZH0MS', 'FEYSM', 'B71ZL', 'WTG1T',
    'UVJBD', 'W1WDH', '1BNJW', 'HVZU2', 'H9DYU', 'YKZ6U', '918VJ', 'PDBJW',
    'CW14M', 'NA97X', 'H8F45', 'OSPKN', 'VBPUB', 'KTAFK', 'O9B8L', '5MTQD',
    '4MUO0', 'HRL6E', '7RGHJ', 'D6ERW', 'R6OPT', '96LLI', 'TEBMJ', 'GUH0T',
    'MXYYI', 'P750N', 'CF8ML', 'COD9Q', 'YEP35', 'CPYCQ', 'LKU4T', 'EXY76',
    'BQMR2', 'AOBUP', '9PF7H', 'ELTX1', 'UJU9V', '0ZKCA', '53079', 'N6HOK',
    'GAMK7', 'JWQWM', 'QA3JY', '19BVY', '1AKC4', 'JAOUU', 'X65HO', 'LLEXQ',
    '4JDIG', '3T076', '6YNJ5', 'NCQLU', 'K0EWX', 'YBAE4', 'NJ6BY', '3U7MO',
    'STDST', 'NT7F0', '4C854', '0LEY1', 'C8LN8', 'NI2OK', 'BT52C', 'U2K0Z',
    'I3ZZX', 'F1ASI', 'KRCMZ', '1JY8U', 'OP9JZ', 'BV0UO', 'EGULU', 'WN3EA',
    '6ZML2', 'R8AXT', 'QV01D', '697UR', 'G3XBY', 'TA1EE', '9IAU2', 'D04CN',
    '7LDVP', 'GK1ZG', 'WME7D', 'BJLI2', '351T1', 'WNMWM', 'H74MX', 'CRL3E',
    'YGVPD', 'ESP62', 'NL1NS', 'VAMAL', '3XP8L', '6HHMP', 'EO5L0', 'RQZ5C',
    '1UVUG', '0B3ZO', 'WKWNB', '9MHCD', 'IOF49', 'T5TOG', 'V9708', '3QGKI',
    'LXOE1', 'ABDW3', 'NU361', 'LKTOK', 'PPHKL', 'C8NFH', 'FG8M4', 'WGP1S',
    'ZQAX3', '7D9SC', 'QK0M0', '82UL6', 'LBQYS', '0WYD8', '47JPF', 'Q2BHZ',
    'DKJNX', 'OEH41', 'UC5XZ', 'XRM3A', 'I0VAO', '9QVJU', '9HXRB', 'JXOPP',
    'CZA5J', 'PWGON', 'U6H4U', 'YR1NK', 'CK0N1', 'PM9Y1', 'SMLO1', 'Y1QW4',
    'TRGAF', 'KZR3K', '08HFF', 'NSE9I', 'Z3Y69', '5QVS0', 'W6TP8', '3YMKG',
    'FC27B', 'EMUE9', '17QP0', 'TWDYY', 'C2TFE', '5EAND', 'C3CXX', 'UCXL8',
    'SCX17', 'YY9S2', 'NQGC0', 'I37FW', 'MHVNL', 'EDZ1J', 'B9ZH5', '21I92',
    'DP7VJ', 'AO5JV', 'Z802E', 'UFQ7Q', '7WQR5', '8X11D', '4C7K2', 'IEGLD',
    '40ZN8', 'QZZH5', 'VNS2U', 'OQ6CZ', 'M30I9', 'TX2YK', 'XB01R', '2LSOJ',
    '6T5GP', 'FRBFZ', 'BYUAG', 'UNQ9Q', 'VL8XX', 'E3UQQ', 'LEOD4', '8BH6N',
    'PYVHC', 'GKHV9', 'DRQ16', 'MC0NP', 'PBAAM', '0RGVW', '1JGYV', 'R8255',
    'YKBPF', 'HD6KV', 'QDCZZ', 'FM4M2', 'YMB89', 'EAW7I', '06SXB', 'UKG4Z',
    'T3M40', 'OXLN3', 'LCHUJ', '5A60M', 'X4BBJ', '9GYZ5', 'NK4LT', 'GU84I',
    'S8T7N', 'CBXZ1', 'ZBA3C', '5X372', 'UXETR', 'T70DH', '069MA', 'W33HY',
    'C0X14', '1CIU3', 'IG4BJ', 'NHDFX', '014H5', 'VGBH9', 'DGDPN', 'NOXEY',
    'KQHK5', 'XMMMO', 'TR1S2', 'X4QYG', 'KWT57', 'FUELE', 'T1UQX', '8ITBE',
    '2Z5SZ', '4BR82', 'SK3QW', '8Q9Z5', 'VQQ8H', 'L6IVD', '3FBUK', 'VZ242',
    'BAU73', 'XQSPQ', 'KBGS7', 'FNDUY', 'ZEI6F', 'G454U', 'IS0CR', '9SUL3',
    'W444H', 'O5LZB', 'SBMON', 'GSXJR', '73E3K', 'S8P1L', 'YC8EX', 'HUUEV',
    '00SUT', '7MNIO', 'IKWZ2', '918AI', 'GK9FM', '14MTM', 'FPL1M', 'IOX4T',
    'CX9K4', 'S9W7C', 'N94UD', '7Q3JV', '6CT7S', 'OZ2A3', 'X4U6U', 'ZW6XY',
    'UD0K7', '3L3T3', 'ZLRS2', '3KJ7D', 'O1S4R', 'F7YU5', 'VOAA7', '7DXFR',
    'C50M5', 'RXT6Q', 'SYE32', 'BFCDN', '1A7A8', 'G5HDM', 'CJ1HJ', 'VY6WJ',
    'N7SUD', 'ZQZ8X', '5XM3J', '7CE6D', 'IGTZH', 'K1XJ7', '7KX81', 'AQJIF',
    'PJGZ6', 'LQWVI', 'YQXUJ', 'MUX7O', '9DBGU', 'N9L5C', 'KDI4R', 'W21B9',
    'IF7OF', 'ZVFXR', 'VQ6EG', '6ED2P', 'QW4GE', 'DCGD6', 'AHSMG', 'BFJ9W',
    '2XOXR', '4JYS2', 'SB6N3', 'STEEH', 'YDAOD', 'JXQ5H', 'KRE69', 'BD6N4',
    'X2SSY', 'UJWS2', 'V4H2J', 'M5LZI', 'DH9PW', 'UEM2F', '35QXB', '08ISO',
    '6EDRG', '9XXNQ', '9W0VD', '69AKA', '0LRW4', 'V8PBP', '14R9E', 'M7R00',
    'A1AT6', 'HCJIT', '1F66K', 'XBWWZ', 'E6H0H', 'W9ACK', 'F5LTX', 'AOT4G',
    'FWC1F', 'I1SII', 'ALK2J', '17VPM', 'EFB17', 'JM9OO', 'IR2NG', 'BMQUF',
    'ZE3A6', 'M7CRO', '1TH4S', 'LVV5L', '06CXV', '98HWN', 'E5MMU', 'IZHR5',
    '0Q3WS', 'M8C7I', 'IZIAA', 'WL619', 'HYX6E', 'K2CZ6', 'AAZCW', 'B0E1U',
    '0ME9Z', 'ESUEL', 'KQ235', '95EF6', 'V4SU1', 'FZFLY', 'IV63P', 'NQ5VT',
    'E0E9V', 'B2YSK', 'P9JH7', '9VXEA', 'HR2CM', 'TGT6R', 'M20FI', 'H6BHD'
  ]
  
route.get("/api/isconnected", async (req, res) => {
    const { connectionCookie } = req.cookies;

    // Check if the cookie exists
    if (connectionCookie) {
        // Check if the connectionCookie value exists in the oldCodes array
        console.log(connectionCookie)
        if (oldCodes.includes(connectionCookie.code)) {
            return res.json({ connected: false });
        }
        return res.json({ connected: true });
    }

    // If no cookie is present
    return res.json({ connected: false });
})

export default route; 