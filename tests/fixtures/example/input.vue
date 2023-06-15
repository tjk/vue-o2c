<template lang="pug">
div
  p Wonderful
</template>

<script>
const greetingDefault = "Hello"

export default {
  props: {
    greeting: {
      type: String,
      default: greetingDefault,
    },
    loading: {
      type: Boolean,
      required: true,
    },
    requiredFalse: {
      type: String,
      required: false,
    },
  },
  data() {
    // this.initializing = true -- would make data() "complex" (need to improve)
    return {
      name: this.$route.query.name || 'John',
      watchMethod: 0,
      watchObject: {
        key: 1,
      },
    }
  },
  methods: {
    meth() {
      console.log(`${this.greeting} ${this.name} ${this.$el.clientHeight}`)
    },
    keyValue: async (a) => {
      await a
    },
  },
  mounted() {
    this.meth()
    this.keyValue()
    delete this.initializing // should not become `delete initializing` (so use $this)
  },
  watch: {
    ["watchMethod"](v) {
      console.log("watchMethod", v)
    },
    "watchObject.key": {
      deep: true,
      immediate: true,
      async handler(v, ov) {
        console.log("watchObject", v, ov)
      },
    },
  },
}

const somethingBelow = 42
</script>

<style scoped>
:root {
  background: red;
}
</style>