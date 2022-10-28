<script>
export default {
  inject: ["injectSomething"],
  created() {
    console.log("injected:", this.injectSomething)
  },
}
</script>