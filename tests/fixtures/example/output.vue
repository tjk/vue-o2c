<template lang="pug">
div(ref="$el")
  p Wonderful
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"

const props = withDefaults(defineProps<{
  greeting?: string
}>(), {
  greeting: "Hello",
})

const $route = useRoute()
const $this = {}

const $el = ref<HTMLElement | undefined>()
const name = ref($route.query.name || 'John')

onMounted(() => {
  doIt()
  delete this.initializing // should not become `delete initializing` (so use $this)
})

const watchMethod = watch((v) => {
  console.log("watchMethod", v)
})
const watchObject = watch(async (v, ov) => {
  console.log("watchObject", v, ov)
}, {
  deep: true,
  immediate: true,
})

function doIt() {
  console.log(`${props.greeting} ${name.value} ${$el.value.clientHeight}`)
}
</script>

<style scoped>
:root {
  background: red;
}
</style>