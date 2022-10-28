<script setup lang="ts">
import { onBeforeMount, onBeforeUnmount, onBeforeUpdate, onErrorCaptured, onMounted, onUnmounted, onUpdated } from "vue"

console.log("beforeCreate")

console.log("created")

onBeforeMount(() => {
  console.log("beforeMount")
})

onMounted(() => {
  console.log("mounted")
})

onBeforeUpdate(() => {
  console.log("beforeUpdate")
})

onUpdated(() => {
  console.log("updated")
})

onBeforeUnmount(() => {
  console.log("beforeDestroy")
})

onUnmounted(() => {
  console.log("destroyed")
})

onErrorCaptured((errArg: Error) => {
  console.error("errorCaptured", errArg)
})
</script>