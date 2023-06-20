<template lang="pug">
div(ref="$el")
  p Wonderful
  RewrittenComponentName(prop="value")
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import SomeComponent from "@components/SomeComponent.vue"

const greetingDefault = "Hello"

const RewrittenComponentName = SomeComponent
const InlineComponent = {
  render() {
    // return h('div', 'inline component')
  },
}

const props = withDefaults(defineProps<{
  greeting?: string
  loading: boolean
  requiredFalse?: string
}>(), {
  greeting: greetingDefault,
})

const $route = useRoute()
const $this = {}

const $el = ref<HTMLElement | undefined>()
const name = ref($route.query.name || 'John')
const watchMethod = ref(0)
const watchObject = ref({
  key: 1,
})

onMounted(() => {
  meth()
  keyValue()
  delete $this.initializing // should not become `delete initializing` (so use $this)
})

watch(() => watchMethod.value, (v) => {
  console.log("watchMethod", v)
})
watch(() => watchObject.value.key, async (v, ov) => {
  console.log("watchObject", v, ov)
}, {
  deep: true,
  immediate: true,
})

function meth() {
  console.log(`${props.greeting} ${name.value} ${$el.value.clientHeight}`)
}
async function keyValue(a) {
  await a
}

const somethingBelow = 42
</script>

<style scoped>
:root {
  background: red;
}
</style>