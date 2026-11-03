// The About page's words, which only it shows: kept out of the catalogs, so
// every other screen's first load doesn't carry them. TypeScript checks that
// Vietnamese has every line English has.
import type { Language } from '../../i18n/language.ts'

const en = {
  title: 'About Tally',
  lead: 'Tally splits shared costs without accounts. Your groups live on your phones, and only people with a group’s link can read it.',
  'private.title': 'Private by design',
  'private.body':
    'A group’s link carries a secret key after the # sign, and browsers never send that part to a server. Your phone uses it to encrypt every change (with AES-256-GCM) before it leaves, so only people with the link can read the group.',
  'relay.title': 'What the server sees',
  'relay.body':
    'A small relay passes the encrypted changes between phones, so people who are never online at the same time still sync. It can see a group’s ID, how big each change is and when it arrives, and your IP address. It can’t see names, amounts, titles or anything else you write.',
  'retention.title': 'How long it keeps them',
  'retention.body':
    'A group nobody opens for 12 months is deleted from the relay. Any phone that still has it uploads it again when it’s next opened.',
  'tracking.title': 'No tracking',
  'tracking.body':
    'No accounts, no analytics, no ads and no third-party scripts. The relay logs errors only, never groups.',
  'lost.title': 'Keep your link',
  'lost.body':
    'If everyone in a group loses both its link and their phones’ data, the group can’t be recovered: nobody else holds the key. That’s the price of encryption.',
  'code.title': 'Open source',
  'code.source': 'Source code on GitHub',
  'code.report': 'Report a problem',
} as const

export type AboutKey = keyof typeof en

const vi: Record<AboutKey, string> = {
  title: 'Giới thiệu Tally',
  lead: 'Tally chia các khoản chi chung mà không cần tài khoản. Các nhóm nằm trên điện thoại của mọi người, và chỉ ai có link của nhóm mới đọc được.',
  'private.title': 'Riêng tư ngay từ thiết kế',
  'private.body':
    'Link của nhóm chứa một khóa bí mật sau dấu #, và trình duyệt không bao giờ gửi phần đó lên máy chủ. Điện thoại của bạn dùng khóa này để mã hóa mọi thay đổi (bằng AES-256-GCM) trước khi gửi đi, nên chỉ người có link mới đọc được nhóm.',
  'relay.title': 'Máy chủ thấy được gì',
  'relay.body':
    'Một máy chủ trung chuyển nhỏ chuyển các thay đổi đã mã hóa giữa các điện thoại, để những người không bao giờ online cùng lúc vẫn đồng bộ được. Máy chủ thấy được mã nhóm, kích thước và thời điểm của từng thay đổi, cùng địa chỉ IP của bạn. Máy chủ không thấy được tên, số tiền, tiêu đề hay bất cứ nội dung nào bạn viết.',
  'retention.title': 'Dữ liệu được giữ bao lâu',
  'retention.body':
    'Nhóm không ai mở trong 12 tháng sẽ bị xóa khỏi máy chủ trung chuyển. Điện thoại nào vẫn còn nhóm sẽ tải nó lên lại ở lần mở tiếp theo.',
  'tracking.title': 'Không theo dõi',
  'tracking.body':
    'Không tài khoản, không phân tích hành vi, không quảng cáo và không có mã của bên thứ ba. Máy chủ chỉ ghi lại lỗi, không bao giờ ghi lại nhóm.',
  'lost.title': 'Hãy giữ link của bạn',
  'lost.body':
    'Nếu mọi người trong nhóm đều mất cả link lẫn dữ liệu trên điện thoại, nhóm sẽ không thể khôi phục: không ai khác giữ khóa. Đó là cái giá của mã hóa.',
  'code.title': 'Mã nguồn mở',
  'code.source': 'Mã nguồn trên GitHub',
  'code.report': 'Báo lỗi',
}

export const ABOUT: Record<Language, Record<AboutKey, string>> = { en, vi }
