<script>
export default {
  emits: ["specifiedButNotUsed"],
  created() {
    this.$emit("usedButNotSpecfied")
  },
}
</script>