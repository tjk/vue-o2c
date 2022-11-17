<script setup lang="ts">
import { computed, ref } from "vue"

const firstName = ref("jane")
const lastName = ref("smith")

const fullName = computed({
  get: () => {
    return `${firstName.value} ${lastName.value}`
  },
  set(v) {
    const parts = v.split(" ")
    firstName.value = parts[0]
    lastName.value = parts[1]
  },
})
</script>