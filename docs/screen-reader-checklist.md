# Screen reader checklist

Axe checks every screen automatically, in both themes and both languages, and
CI tests every flow by keyboard. What a screen reader actually says can only be
heard on a real phone, so this is the short check to run before v1 (SPEC.md
section 9). It takes about 15 minutes per phone.

Note anything that's **not read**, **read twice**, **named wrongly** (a button
read only as "button"), or that **traps you** (you can't swipe past it).

## Turning it on

- **iPhone, VoiceOver:** Settings → Accessibility → VoiceOver. Swipe right or
  left to move, double-tap to activate, swipe up or down with the rotor to
  change what a swipe moves by.
- **Android, TalkBack:** Settings → Accessibility → TalkBack. The same swipes
  and double-tap.

Use the live address, in Safari on the iPhone and Chrome on Android.

## The checks

1. **Home.** Swiping from the top reads the tagline, then **New group**, then
   **Join with a link**, then "Your groups" and the groups (or the intro).
2. **New group.** Each field reads its label ("Group name", "Currency", "Your
   name", "Person 1"). Tap **Create group** with the name empty: the error,
   "Give the group a name.", is read.
3. **Invite.** After creating, a dialog "Invite people" opens and focus is
   inside it: the close button is read first, the QR code as "QR code of the
   invite link". Closing returns you to the group.
4. **Group screen.** The header reads the group name, then the sync status
   button ("Synced"), **Invite people** and **Group settings**. The tabs read as
   links, with the current one marked as the current page; Activity with new
   changes reads "Activity, new changes".
5. **Add an expense.** "Amount" is read on the amount field, and the split
   modes as radio buttons ("Equally", 1 of 4). With **Exact amounts**, typing an
   amount reads how much is left to assign, without moving your focus.
6. **Balances.** Each person's balance is read in words ("owes ₫300,000",
   "gets back ₫900,000"), never by color alone. **Mark as paid** reads
   "Payment recorded", with **Undo** next.
7. **Activity.** Entries read newest first, each with who did what and when;
   **Restore** reads with the item it restores.
8. **Vietnamese.** In Settings, choose Tiếng Việt. The screen reader switches
   to a Vietnamese voice, and amounts read as Vietnamese numbers.
9. **Joining.** Open the invite link on the other phone: "Who are you?" is
   read, then each member as a button, then "I'm not on the list".
10. **Offline.** Turn on airplane mode and add an expense: the status button
    reads "Offline · 1 change waiting". Turn it off: it reads "Synced".
11. **Large text.** Set the phone's text size to the largest (iPhone: Display &
    Text Size → Larger Text; Android: Font size). Nothing is cut off, and no
    screen scrolls sideways.

When you're done, send me what you noted per step, with the phone and its
system version.
