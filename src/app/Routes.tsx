import { lazy, useDeferredValue } from 'react'
import { Route, Switch, useLocation } from 'wouter'

import { HomeRoute } from '../features/home/HomeRoute.tsx'

// Home ships with the app; every other screen is its own chunk, so no route's
// first load carries the code for all of them.
const screens = {
  newGroup: () => import('../features/new-group/NewGroupRoute.tsx'),
  expenses: () => import('../features/expenses/ExpensesRoute.tsx'),
  balances: () => import('../features/balances/BalancesRoute.tsx'),
  activity: () => import('../features/activity/ActivityRoute.tsx'),
  settings: () => import('../features/settings/SettingsRoute.tsx'),
  expense: () => import('../features/expense/ExpenseFormRoute.tsx'),
  payment: () => import('../features/payment/PaymentFormRoute.tsx'),
  about: () => import('../features/about/AboutRoute.tsx'),
  notFound: () => import('./NotFoundRoute.tsx'),
}

const NewGroupRoute = lazy(screens.newGroup)
const ExpensesRoute = lazy(screens.expenses)
const BalancesRoute = lazy(screens.balances)
const ActivityRoute = lazy(screens.activity)
const SettingsRoute = lazy(screens.settings)
const ExpenseFormRoute = lazy(screens.expense)
const PaymentFormRoute = lazy(screens.payment)
const AboutRoute = lazy(screens.about)
const NotFoundRoute = lazy(screens.notFound)

/** Fetches every screen once the app is idle, so moving between them doesn't wait. */
export function preloadScreens() {
  for (const load of Object.values(screens)) void load()
}

export function Routes() {
  const [location] = useLocation()
  // A lazy screen suspends on first render even when its code has arrived.
  // Rendering a deferred location keeps the current screen up meanwhile,
  // instead of flashing the loading frame.
  const shown = useDeferredValue(location)
  return (
    <Switch location={shown}>
      <Route path="/" component={HomeRoute} />
      <Route path="/new" component={NewGroupRoute} />
      <Route path="/about" component={AboutRoute} />
      <Route path="/g/:groupId" component={ExpensesRoute} />
      <Route path="/g/:groupId/balances" component={BalancesRoute} />
      <Route path="/g/:groupId/activity" component={ActivityRoute} />
      <Route path="/g/:groupId/settings" component={SettingsRoute} />
      <Route path="/g/:groupId/e/new" component={ExpenseFormRoute} />
      <Route path="/g/:groupId/e/:expenseId" component={ExpenseFormRoute} />
      <Route path="/g/:groupId/pay/new" component={PaymentFormRoute} />
      <Route path="/g/:groupId/pay/:paymentId" component={PaymentFormRoute} />
      <Route component={NotFoundRoute} />
    </Switch>
  )
}
