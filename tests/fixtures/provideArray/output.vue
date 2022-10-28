<script setup lang="ts">
import { computed, provide, ref } from "vue"

const dataVar = ref(0)

const computedVar = computed(() => {
  return "1"
})

function methodVar() {
  console.log("test")
}

provide("dataVar", dataVar)
provide("computedVar", computedVar)
provide("methodVar", methodVar)
</script>
