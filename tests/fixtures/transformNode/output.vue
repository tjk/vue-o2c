<script setup lang="ts">
import { ref } from 'vue'

const a = ref(0)
const b = ref(1)
const c = ref(2)
const d = ref(3)

function test() {
  return `${a.value} ${b.value} ${c.value} this.d this.e`
}
// test this.a, this['b'], this["c"], "this.d"
// what happens with more complex structures (eg. this['g'+'h'])
</script>