import pageStyles from '../ui/Page.module.css'
import { TallyMark } from '../ui/TallyMark.tsx'
import styles from './Shell.module.css'

/**
 * The app's frame with placeholders, shown while the app or a screen loads.
 * The build also prerenders it into index.html, so it has no text to
 * translate and no route to match.
 */
export function Shell() {
  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.header}>
        <div className={pageStyles.bar}>
          <p className={pageStyles.brand}>
            <TallyMark className={pageStyles.mark} />
            Tally
          </p>
        </div>
      </header>
      <main className={pageStyles.main} aria-busy="true">
        <div className={`${styles.placeholder} ${styles.tall}`} />
        <div className={styles.placeholder} />
        <div className={styles.placeholder} />
      </main>
    </div>
  )
}
