import { describe, test } from 'vitest'

describe('sprite:lifecycle IPC handler', () => {
  // DASH-02: Start action
  test.todo('start action spawns: sprite exec -s <name> -o <org> echo waking')

  // DASH-03: Stop action
  test.todo('stop action spawns: sprite stop -s <name> -o <org>')

  // DASH-05: Create action
  test.todo('create action spawns: sprite create <name> --skip-console -o <org>')

  // DASH-04: Destroy action
  test.todo('destroy action spawns: sprite destroy <name> --force -o <org>')

  test.todo('unknown action returns error')
  test.todo('sends lifecycle:progress events to renderer during spawn')
})
