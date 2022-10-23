<template lang="pug">
div
  p Wonderful
</template>

<script>
export default {
  props: {
    greeting: {
      type: String,
      default: "Hello",
    },
  },
  data() {
    this.initializing = true
    return {
      name: this.$route.query.name || 'John',
    };
  },
  methods: {
    doIt() {
      console.log(`${this.greeting} ${this.name} ${this.$el.clientHeight}`);
    },
  },
  mounted() {
    this.doIt();
    delete this.initializing // should not become `delete initializing` (so use $this)
  },
};
</script>

<style scoped>
:root {
  background: red;
}
</style>