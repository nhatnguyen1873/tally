import { TallyMark } from '../ui/TallyMark.tsx'
import styles from './App.module.css'

// Placeholder shown until the core screens land in milestone 2.
export function App() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <TallyMark className={styles.logo} />
        <h1 className={styles.title}>Tally</h1>
        <p className={styles.tagline}>
          Split costs with friends. No sign-up, works offline, and only your group can read it.
        </p>
        <p className={styles.status}>
          <span className={styles.badge}>Preview</span>
          The first version is being built in the open.
        </p>
        <a className={styles.link} href="https://github.com/nhatnguyen1873/tally">
          Follow along on GitHub
        </a>
      </div>
    </main>
  )
}
